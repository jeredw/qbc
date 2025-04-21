import * as parser from "../build/QBasicParser.ts";
import * as statements from "./statements/StatementRegistry.ts";
import { QBasicParserListener } from "../build/QBasicParserListener.ts";
import { ParseError } from "./Errors.ts";
import { Program, ProgramChunk } from "./Programs.ts";
import { ParserRuleContext, ParseTreeWalker, Token } from "antlr4ng";
import { Variable } from "./Variables.ts";
import { parseLiteral, typeCheckExpression } from "./Expressions.ts";
import { reference, isError, getDefaultValue, isString as isStringValue } from "./Values.ts";
import { sameType, splitSigil, Type, TypeTag, isString as isStringType } from "./Types.ts";
import { isBuiltin, isProcedure, isVariable, QBasicSymbol } from "./SymbolTable.ts";
import { getTyperContext } from "./Typer.ts";
import { Statement } from "./statements/Statement.ts";
import { Procedure } from "./Procedures.ts";
import { BranchIndexStatement } from "./statements/Branch.ts";
import { StorageType } from "./Memory.ts";
import { StackVariable } from "./statements/Call.ts";
import { Builtin, BuiltinParam } from "./Builtins.ts";
import { DimBoundsExprs } from "./statements/Arrays.ts";
import { RestoreStatement } from "./statements/Data.ts";
import { PrintExpr } from "./statements/Print.ts";
import { OpenMode } from "./Files.ts";
import { EventType } from "./statements/Events.ts";
import { EventChannelState } from "./Events.ts";
import { KeyStatementOperation } from "./statements/Keyboard.ts";
import { FieldDefinition } from "./statements/FileSystem.ts";

export interface CodeGeneratorContext {
  // Generated label for this statement.
  $label: string;
  // Label for the next branch of an if/select.
  $nextBranchLabel: string;
  // Top of block (loops).
  $topLabel: string;
  // End of block (end if/loop exit).
  $exitLabel: string;
}

export function getCodeGeneratorContext(ctx: ParserRuleContext): CodeGeneratorContext {
  return ctx as unknown as CodeGeneratorContext;
}

export class CodeGenerator extends QBasicParserListener {
  private _allLabels: Set<string> = new Set();
  private _chunk: ProgramChunk;
  private _program: Program;
  private _syntheticLabelIndex = 0;
  private _arrayBaseIndex: number = 0;
  private _labelToDataIndex: Map<string, number> = new Map();

  constructor(program: Program, arrayBaseIndex: number) {
    super();
    this._program = program;
    this._chunk = program.chunks[0];
    this._arrayBaseIndex = arrayBaseIndex;
  }

  get program() {
    return this._program;
  }

  override exitProgram = (_ctx: parser.ProgramContext) => {
    this._program.chunks.forEach((chunk) => this.assignTargets(chunk));
  }

  private assignTargets(chunk: ProgramChunk) {
    for (const [statementIndex, targetRef] of chunk.indexToTarget) {
      const statement = chunk.statements[statementIndex];
      if (statement instanceof RestoreStatement) {
        const dataIndex = this._labelToDataIndex.get(targetRef.label);
        if (dataIndex === undefined) {
          throw ParseError.fromToken(targetRef.token, "Label not defined");
        }
        (statement as RestoreStatement).dataIndex = dataIndex;
        continue;
      }
      const targetIndex = chunk.labelToIndex.get(targetRef.label);
      if (targetIndex === undefined) {
        throw ParseError.fromToken(targetRef.token, "Label not defined");
      }
      if (statement.targetIndex !== undefined && !(statement instanceof BranchIndexStatement)) {
        throw new Error("Only expecting one target");
      }
      statement.targetIndex = targetIndex;
      if (!statement.targets) {
        statement.targets = [targetIndex];
      } else {
        statement.targets.push(targetIndex);
      }
    };
  }

  override enterLabel = (ctx: parser.LabelContext) => {
    const label = this.canonicalizeLabel(ctx);
    if (this._allLabels.has(label)) {
      throw ParseError.fromToken(ctx.start!, "Duplicate label");
    }
    this._allLabels.add(label);
    this.addLabelForNextStatement(label);
    this._labelToDataIndex.set(label, this._program.data.length);
  }

  private makeSyntheticLabel(): string {
    return `_${this._syntheticLabelIndex++}`;
  }

  override enterTarget = (ctx: parser.TargetContext) => {
    const label = this.canonicalizeLabel(ctx);
    this.setTargetForCurrentStatement(label, ctx);
  }

  override enterImplicit_goto_target = (ctx: parser.Implicit_goto_targetContext) => {
    this._chunk.statements.push(statements.goto());
    const label = this.canonicalizeLabel(ctx);
    this.setTargetForCurrentStatement(label, ctx);
  }

  private canonicalizeLabel(ctx: ParserRuleContext): string {
    const label = ctx.getText();
    const stripped = label.endsWith(':') ? label.substring(0, label.length - 1) : label;
    const lowercase = stripped.toLowerCase();
    const [_, sigil] = splitSigil(lowercase);
    if (sigil) {
      throw ParseError.fromToken(ctx.start!, "Expected: label or line number");
    }
    return lowercase;
  }

  private enterProcedure = (ctx: ParserRuleContext) => {
    const procedure = getTyperContext(ctx).$procedure;
    if (!procedure) {
      throw new Error("missing procedure");
    }
    this._chunk = this._program.chunks[procedure.programChunkIndex];
  }

  private exitProcedure = (_ctx: ParserRuleContext) => {
    this._chunk = this._program.chunks[0];
  }

  override enterDef_fn_statement = this.enterProcedure;
  override exitDef_fn_statement = this.exitProcedure;
  override enterFunction_statement = this.enterProcedure;
  override exitFunction_statement = this.exitProcedure;
  override enterSub_statement = this.enterProcedure;
  override exitSub_statement = this.exitProcedure;

  // Emit explicit end statements for end function / end sub so that the strange
  // behavior of ignoring END SUB : statements works.
  override enterEnd_function_statement = (ctx: parser.End_function_statementContext) => {
    this.addStatement(statements.endFunction());
  }

  override enterEnd_sub_statement = (ctx: parser.End_sub_statementContext) => {
    this.addStatement(statements.endSub());
  }

  override enterIf_block_statement = (ctx: parser.If_block_statementContext) => {
    let prevBranch: ParserRuleContext = ctx;
    const endIf = ctx.end_if_statement();
    if (!endIf) {
      throw new Error("missing end if");
    }
    const endIfLabel = this.makeSyntheticLabel();
    getCodeGeneratorContext(endIf).$label = endIfLabel;
    const labelBranch = (branch: ParserRuleContext) => {
      const label = this.makeSyntheticLabel();
      getCodeGeneratorContext(prevBranch).$nextBranchLabel = label;
      getCodeGeneratorContext(branch).$label = label;
      getCodeGeneratorContext(branch).$exitLabel = endIfLabel;
      prevBranch = branch;
    };
    for (const elseIf of ctx.elseif_block_statement()) {
      labelBranch(elseIf);
    }
    const elseBlock = ctx.else_block_statement();
    if (elseBlock) {
      labelBranch(elseBlock);
    }
    getCodeGeneratorContext(prevBranch).$nextBranchLabel = endIfLabel;
    const test = this.compileBoolean(ctx.expr());
    this.addStatement(statements.if_(test));
    this.setTargetForCurrentStatement(getCodeGeneratorContext(ctx).$nextBranchLabel, ctx);
  }

  override enterElseif_block_statement = (ctx: parser.Elseif_block_statementContext) => {
    const labels = getCodeGeneratorContext(ctx);
    this.addStatement(statements.goto());
    this.setTargetForCurrentStatement(labels.$exitLabel, ctx);
    this.addLabelForNextStatement(labels.$label);
    const test = this.compileBoolean(ctx.expr());
    this.addStatement(statements.elseIf(test));
    this.setTargetForCurrentStatement(labels.$nextBranchLabel, ctx);
  }

  override enterElse_block_statement = (ctx: parser.Else_block_statementContext) => {
    const labels = getCodeGeneratorContext(ctx);
    this.addStatement(statements.goto());
    this.setTargetForCurrentStatement(labels.$exitLabel, ctx);
    this.addLabelForNextStatement(labels.$label);
  }

  override enterEnd_if_statement = (ctx: parser.End_if_statementContext) => {
    const labels = getCodeGeneratorContext(ctx);
    this.addLabelForNextStatement(labels.$label);
  }

  private getLvalue(token: Token, symbol: QBasicSymbol): Variable {
    if (isProcedure(symbol) && symbol.procedure.name == this._chunk.procedure?.name) {
      if (!symbol.procedure.result) {
        throw new Error("missing fn result");
      }
      return symbol.procedure.result;
    }
    if (!isVariable(symbol)) {
      throw ParseError.fromToken(token, "Duplicate definition");
    }
    return symbol.variable;
  }

  override enterAssignment_statement = (ctx: parser.Assignment_statementContext) => {
    const assignee = ctx.variable_or_function_call();
    const symbol = getTyperContext(assignee).$symbol;
    if (!symbol) {
      throw new Error("missing symbol");
    }
    const variable = this.getLvalue(assignee._name!, symbol);
    if (variable.array) {
      // Evaluate an array index expression for an lvalue first.
      const result = getTyperContext(assignee).$result;
      if (!result) {
        throw new Error("missing result variable");
      }
      this.indexArray(variable, assignee.start!, assignee.argument_list(), result);
      const expr = this.compileExpression(ctx.expr(), assignee._name!, variable.type);
      this.addStatement(statements.let_(result, expr));
    } else {
      const expr = this.compileExpression(ctx.expr(), assignee._name!, variable.type);
      this.addStatement(statements.let_(variable, expr));
    }
  }

  override enterMid_statement = (ctx: parser.Mid_statementContext) => {
    const variable = this.getVariable(ctx.variable_or_function_call());
    const startExpr = this.compileExpression(ctx._start!, ctx._start!.start!, { tag: TypeTag.INTEGER });
    let lengthExpr: parser.ExprContext | undefined;
    if (ctx._length) {
      lengthExpr = this.compileExpression(ctx._length!, ctx._length!.start!, { tag: TypeTag.INTEGER });
    }
    const stringExpr = this.compileExpression(ctx._string_!, ctx._string_!.start!, { tag: TypeTag.STRING });
    this.addStatement(statements.midStatement(ctx.start!, variable, startExpr, lengthExpr, stringExpr));
  }

  override enterCall_statement = (ctx: parser.Call_statementContext) => {
    const builtin = getTyperContext(ctx).$builtin;
    if (builtin) {
      if (ctx.CALL()) {
        throw ParseError.fromToken(ctx.untyped_id().start!, "Expected identifier");
      }
      this.callBuiltin(builtin, ctx.start!, ctx.argument_list());
      return;
    }
    const procedure = getTyperContext(ctx).$procedure;
    if (!procedure) {
      throw new Error("missing procedure");
    }
    this.call(procedure, ctx.start!, ctx.argument_list());
  }

  private indexArray(variable: Variable, token: Token, argumentListCtx: parser.Argument_listContext | null, result: Variable) {
    if (!variable.array) {
      throw new Error("indexing non array variable");
    }
    const args = argumentListCtx?.argument() ?? [];
    if (variable.array.dimensions.length != args.length) {
      throw ParseError.fromToken(token, "Wrong number of dimensions");
    }
    const indexExprs: parser.ExprContext[] = [];
    for (let i = 0; i < args.length; i++) {
      const parseExpr = args[i].expr();
      if (!parseExpr) {
        throw ParseError.fromToken(args[i].start!, "Type mismatch");
      }
      indexExprs.push(this.compileExpression(parseExpr, args[i].start!, {tag: TypeTag.INTEGER}));
    }
    this.addStatement(statements.indexArray(variable, indexExprs, result));
  }

  private callBuiltin(builtin: Builtin, token: Token, argumentListCtx: parser.Argument_listContext | null, result?: Variable) {
    if (builtin.returnType && !result || !builtin.returnType && result) {
      throw ParseError.fromToken(token, "Duplicate definition");
    }
    const args = argumentListCtx?.argument() ?? [];
    if (args.length > builtin.arguments.length) {
      throw ParseError.fromToken(token, "Argument-count mismatch");
    }
    const params: BuiltinParam[] = [];
    for (let i = 0; i < builtin.arguments.length; i++) {
      if (!args[i]) {
        if (builtin.arguments[i].optional) {
          params.push({});
          continue;
        }
        throw ParseError.fromToken(token, "Argument-count mismatch");
      }
      const parseExpr = args[i].expr();
      if (!parseExpr) {
        throw new Error("unimplemented");
      }
      params.push({expr: this.compileExpression(parseExpr, args[i].start!, builtin.arguments[i].type)});
    }
    this.addStatement(builtin.statement({token, params, result}));
  }

  private call(procedure: Procedure, token: Token, argumentListCtx: parser.Argument_listContext | null, result?: Variable) {
    if (procedure.result && !result || !procedure.result && result) {
      // Attempting to call a function with a call statement, or a sub from an expression.
      throw ParseError.fromToken(token, "Duplicate definition");
    }
    const args = argumentListCtx?.argument() ?? [];
    if (args.length != procedure.parameters.length) {
      throw ParseError.fromToken(token, "Argument-count mismatch");
    }
    const stackVariables: StackVariable[] = [];
    for (let i = 0; i < args.length; i++) {
      const parseExpr = args[i].expr();
      const parameter = procedure.parameters[i];
      if (!parseExpr) {
        const result = getTyperContext(args[i]).$result;
        if (!result) {
          throw new Error("missing array reference");
        }
        if (!sameType(result.type, parameter.type)) {
          throw ParseError.fromToken(args[i].start!, "Parameter type mismatch");
        }
        stackVariables.push({variable: parameter, value: reference(result)});
        continue;
      }
      const variable = this.getVariableFromExpression(parseExpr);
      if (variable) {
        // Type must match exactly for pass by reference.
        if (!sameType(variable.type, parameter.type)) {
          throw ParseError.fromToken(args[i].start!, "Parameter type mismatch");
        }
        stackVariables.push({variable: parameter, value: reference(variable)});
      } else {
        if (parameter.type.tag == TypeTag.RECORD || parameter.array) {
          // Can't pass records or arrays by value.
          throw ParseError.fromToken(args[i].start!, "Parameter type mismatch");
        }
        const expr = this.compileExpression(parseExpr, args[i].start!, procedure.parameters[i].type);
        stackVariables.push({variable: parameter, expr});
      }
    }
    if (procedure.result && result) {
      stackVariables.push({variable: procedure.result, value: reference(result)});
    }
    const locals = this._program.chunks[procedure.programChunkIndex].symbols.variables();
    for (const variable of locals) {
      if (!variable.isParameter && variable.storageType == StorageType.AUTOMATIC) {
        stackVariables.push({variable, value: getDefaultValue(variable)});
      }
    }
    if (stackVariables.length != this.program.chunks[procedure.programChunkIndex].stackSize) {
      throw new Error("stack size mismatch");
    }
    this.addStatement(statements.call(procedure.programChunkIndex, stackVariables));
  }

  override enterError_statement = (ctx: parser.Error_statementContext) => {}
  override enterCircle_statement = (ctx: parser.Circle_statementContext) => {}
  override enterClear_statement = (ctx: parser.Clear_statementContext) => {}

  override enterClose_statement = (ctx: parser.Close_statementContext) => {
    for (const expr of ctx.expr()) {
      const fileNumber = this.compileExpression(expr, expr.start!, { tag: TypeTag.INTEGER });
      this.addStatement(statements.close(fileNumber));
    }
  }

  override enterColor_statement = (ctx: parser.Color_statementContext) => {
    const arg1 = ctx._arg1 && this.compileExpression(ctx._arg1, ctx._arg1.start!, { tag: TypeTag.INTEGER });
    const arg2 = ctx._arg2 && this.compileExpression(ctx._arg2, ctx._arg2.start!, { tag: TypeTag.INTEGER });
    const arg3 = ctx._arg3 && this.compileExpression(ctx._arg3, ctx._arg3.start!, { tag: TypeTag.INTEGER });
    this.addStatement(statements.color(ctx.start!, arg1, arg2, arg3));
  }

  override enterCommon_statement = (ctx: parser.Common_statementContext) => {}
  override enterDef_seg_statement = (ctx: parser.Def_seg_statementContext) => {}

  override enterData_statement = (ctx: parser.Data_statementContext) => {
    for (const item of ctx.data_item()) {
      const quotedItem = item.DATA_QUOTED();
      if (quotedItem) {
        this._program.data.push({text: quotedItem.getText(), quoted: true});
        continue;
      }
      const unquotedItem = item.DATA_UNQUOTED();
      if (unquotedItem) {
        this._program.data.push({text: unquotedItem.getText()});
        continue;
      }
      this._program.data.push({});
    }
  }

  override enterRead_statement = (ctx: parser.Read_statementContext) => {
    for (const variableCtx of ctx.variable_or_function_call()) {
      const variable = this.getVariable(variableCtx);
      this.addStatement(statements.read(variableCtx.start!, variable));
    }
  }

  override enterRestore_statement = (_ctx: parser.Restore_statementContext) => {
    this.addStatement(statements.restore());
  }

  override enterDim_statement = (ctx: parser.Dim_statementContext) => {
    for (const dim of ctx.dim_variable()) {
      const result = getTyperContext(dim).$result;
      if (!result) {
        continue;
      }
      if (!result.array || !result.array.dynamic) {
        throw new Error("found result on non-dynamic array dim")
      }
      const ranges = dim.dim_array_bounds();
      if (!ranges) {
        throw new Error("missing array bounds");
      }
      const bounds: DimBoundsExprs[] = [];
      for (const range of ranges.dim_subscript()) {
        const lower = range._lower ?
          this.compileExpression(range._lower, range._lower.start!, {tag: TypeTag.INTEGER}) :
          undefined;
        const upper = this.compileExpression(range._upper!, range._upper!.start!, {tag: TypeTag.INTEGER});
        bounds.push({lower, upper});
      }
      this.addStatement(statements.dim(this._arrayBaseIndex, dim.start!, bounds, result));
    }
  }

  override enterDate_statement = (ctx: parser.Date_statementContext) => {
    const token = ctx.start!;
    const expr = this.compileExpression(ctx.expr(), ctx.expr().start!, { tag: TypeTag.STRING });
    this.addStatement(statements.dateStatement(token, expr));
  }

  override enterTime_statement = (ctx: parser.Time_statementContext) => {
    const token = ctx.start!;
    const expr = this.compileExpression(ctx.expr(), ctx.expr().start!, { tag: TypeTag.STRING });
    this.addStatement(statements.timeStatement(token, expr));
  }

  override enterDo_loop_statement = (ctx: parser.Do_loop_statementContext) => {
    const labels = getCodeGeneratorContext(ctx);
    labels.$exitLabel = this.makeSyntheticLabel();
    labels.$topLabel = this.makeSyntheticLabel();
    this.addLabelForNextStatement(labels.$topLabel);
    const condition = ctx.do_condition();
    if (condition) {
      const isWhile = !!condition.WHILE();
      const test = this.compileBoolean(condition.expr()!);
      this.addStatement(statements.do_(isWhile, test));
      this.setTargetForCurrentStatement(labels.$exitLabel, ctx);
    }
  }

  override exitDo_loop_statement = (ctx: parser.Do_loop_statementContext) => {
    const labels = getCodeGeneratorContext(ctx);
    const condition = ctx.loop_condition();
    if (condition) {
      const isWhile = !!condition.WHILE();
      const test = this.compileBoolean(condition.expr()!);
      this.addStatement(statements.loop(isWhile, test));
      this.setTargetForCurrentStatement(labels.$topLabel, ctx);
    } else {
      this.addStatement(statements.goto());
      this.setTargetForCurrentStatement(labels.$topLabel, ctx);
    }
    this.addLabelForNextStatement(labels.$exitLabel);
  }

  override enterEnd_statement = (ctx: parser.End_statementContext) => {
    this.addStatement(statements.end());
  }

  override enterField_statement = (ctx: parser.Field_statementContext) => {
    const token = ctx.start!;
    const fileNumber = this.compileExpression(ctx._filenum!, ctx._filenum!.start!, { tag: TypeTag.INTEGER });
    const fields: FieldDefinition[] = [];
    for (const field of ctx.field_assignment()) {
      const widthExpr = this.compileExpression(field.expr(), field.expr().start!, { tag: TypeTag.INTEGER });
      const variableCtx = field.variable_or_function_call();
      const variable = this.getVariable(variableCtx);
      if (variable.type.tag === TypeTag.FIXED_STRING) {
        throw ParseError.fromToken(variableCtx.start!, "Fixed-length string illegal");
      }
      if (variable.type.tag !== TypeTag.STRING) {
        throw ParseError.fromToken(variableCtx.start!, "Type mismatch");
      }
      fields.push({widthExpr, variable});
    }
    this.addStatement(statements.field(token, fileNumber, fields));
  }

  override enterGet_io_statement = (ctx: parser.Get_io_statementContext) => {
    const token = ctx.start!;
    const fileNumber = this.compileExpression(ctx._filenum!, ctx._filenum!.start!, { tag: TypeTag.INTEGER });
    let recordNumber: parser.ExprContext | undefined;
    if (ctx._recordnum) {
      recordNumber = this.compileExpression(ctx._recordnum, ctx._recordnum.start!, { tag: TypeTag.INTEGER });
    }
    let variable: Variable | undefined;
    const variableCtx = ctx.variable_or_function_call();
    if (variableCtx) {
      variable = this.getVariable(variableCtx);
    }
    this.addStatement(statements.getIo(token, fileNumber, recordNumber, variable));
  }

  override enterPut_io_statement = (ctx: parser.Put_io_statementContext) => {
    const token = ctx.start!;
    const fileNumber = this.compileExpression(ctx._filenum!, ctx._filenum!.start!, { tag: TypeTag.INTEGER });
    let recordNumber: parser.ExprContext | undefined;
    if (ctx._recordnum) {
      recordNumber = this.compileExpression(ctx._recordnum, ctx._recordnum.start!, { tag: TypeTag.INTEGER });
    }
    let variable: Variable | undefined;
    const variableCtx = ctx.variable_or_function_call();
    if (variableCtx) {
      variable = this.getVariable(variableCtx);
    }
    this.addStatement(statements.putIo(token, fileNumber, recordNumber, variable));
  }

  override enterFor_next_statement = (ctx: parser.For_next_statementContext) => {
    // These three assignments are always done:
    //   let counter = startexpr
    //   let $end = endexpr
    //   let $increment = incrementexpr
    // Then there's a test to check whether increment's sign is consistent with
    // the loop direction:
    //   For(counter, $end, $increment?) -> exit
    // The increment happens in the NEXT statement.
    //   top: <body>
    //   Next(<token>, counter, $end, $increment?) -> top
    //   exit:
    const symbol = getTyperContext(ctx).$symbol;
    if (!symbol) {
      throw new Error("missing symbol");
    }
    const counter = this.getLvalue(ctx.ID(0)!.symbol, symbol);
    const start = ctx._start;
    if (!start) {
      throw new Error("missing start expr");
    }
    const startExpr = this.compileExpression(start, start.start!, counter.type);
    this.addStatement(statements.let_(counter, startExpr));

    const endVariable = getTyperContext(ctx).$end;
    if (!endVariable) {
      throw new Error("missing end variable");
    }
    const end = ctx._end;
    if (!end) {
      throw new Error("missing end expr");
    }
    const endExpr = this.compileExpression(end, end.start!, counter.type);
    this.addStatement(statements.let_(endVariable, endExpr));

    const incrementVariable = getTyperContext(ctx).$increment;
    if (ctx.STEP()) {
      if (!incrementVariable) {
        throw new Error("missing increment");
      }
      const increment = ctx._increment;
      if (!increment) {
        throw new Error("missing step expr");
      }
      const incrementExpr = this.compileExpression(increment, increment.start!, counter.type);
      this.addStatement(statements.let_(incrementVariable, incrementExpr));
    }

    const labels = getCodeGeneratorContext(ctx);
    labels.$topLabel = this.makeSyntheticLabel();
    labels.$exitLabel = this.makeSyntheticLabel();
    this.addStatement(statements.for_(counter, endVariable, ctx.STEP() && incrementVariable));
    this.setTargetForCurrentStatement(labels.$exitLabel, ctx);
    this.addLabelForNextStatement(labels.$topLabel);
  }

  override exitFor_next_statement = (ctx: parser.For_next_statementContext) => {
    const symbol = getTyperContext(ctx).$symbol;
    if (!symbol) {
      throw new Error("missing symbol");
    }
    const counter = this.getLvalue(ctx.ID(0)!.symbol, symbol);
    const endVariable = getTyperContext(ctx).$end;
    if (!endVariable) {
      throw new Error("missing end");
    }
    const incrementVariable = getTyperContext(ctx).$increment;
    if (ctx.STEP() && !incrementVariable) {
      throw new Error("missing increment");
    }

    const labels = getCodeGeneratorContext(ctx);
    this.addStatement(statements.next(ctx.start!, counter, endVariable, ctx.STEP() && incrementVariable));
    this.setTargetForCurrentStatement(labels.$topLabel, ctx);
    this.addLabelForNextStatement(labels.$exitLabel);
  }

  override enterGet_graphics_statement = (ctx: parser.Get_graphics_statementContext) => {}

  override enterGosub_statement = (ctx: parser.Gosub_statementContext) => {
    this.addStatement(statements.gosub());
  }

  override enterGoto_statement = (ctx: parser.Goto_statementContext) => {
    this.addStatement(statements.goto());
  }

  override enterIf_inline_statement = (ctx: parser.If_inline_statementContext) => {
    const labels = getCodeGeneratorContext(ctx);
    labels.$exitLabel = this.makeSyntheticLabel();
    const test = this.compileBoolean(ctx.expr());
    this.addStatement(statements.if_(test));
    const elseCtx = ctx.if_inline_else_statement();
    if (!elseCtx) {
      // if cond -> exit
      //   <then...>
      // exit:
      this.setTargetForCurrentStatement(labels.$exitLabel, ctx);
    } else {
      // if cond -> else
      //   <then...>
      //   goto exit
      // else:
      //   <else...>
      // exit:
      const elseLabel = this.makeSyntheticLabel();
      this.setTargetForCurrentStatement(elseLabel, ctx);
      getCodeGeneratorContext(elseCtx).$label = elseLabel;
      getCodeGeneratorContext(elseCtx).$exitLabel = labels.$exitLabel;
    }
  }

  override enterIf_inline_else_statement = (ctx: parser.If_inline_else_statementContext) => {
    const labels = getCodeGeneratorContext(ctx);
    this.addStatement(statements.goto());
    this.setTargetForCurrentStatement(labels.$exitLabel, ctx);
    this.addLabelForNextStatement(labels.$label);
  }

  override exitIf_inline_statement = (ctx: parser.If_inline_statementContext) => {
    const labels = getCodeGeneratorContext(ctx);
    this.addLabelForNextStatement(labels.$exitLabel);
  }

  override enterInput_statement = (ctx: parser.Input_statementContext) => {
    const token = ctx.start!;
    const sameLine = !!ctx._sameline;
    let prompt: string | undefined;
    if (ctx._prompt) {
      const value = parseLiteral(ctx._prompt.text!);
      if (!isStringValue(value)) {
        throw new Error("expecting string");
      }
      prompt = value.string;
    }
    const mark = !!(ctx._mark && ctx._mark.text === ';') || prompt === undefined;
    const variables: Variable[] = [];
    for (const variableCtx of ctx.variable_or_function_call()) {
      const variable = this.getVariable(variableCtx);
      variables.push(variable);
    }
    this.addStatement(statements.input({token, sameLine, mark, prompt, variables}));
  }

  override enterInput_file_statement = (ctx: parser.Input_file_statementContext) => {
    const token = ctx.start!;
    const fileNumber = this.compileExpression(ctx.file_number(), ctx.file_number().start!, { tag: TypeTag.INTEGER });
    const variables: Variable[] = [];
    for (const variableCtx of ctx.variable_or_function_call()) {
      const variable = this.getVariable(variableCtx);
      variables.push(variable);
    }
    this.addStatement(statements.inputFile({token, fileNumber, variables}));
  }

  override enterLine_input_statement = (ctx: parser.Line_input_statementContext) => {
    const token = ctx.start!;
    const sameLine = !!ctx._sameline;
    const mark = !!(ctx._mark && ctx._mark.text === ';');
    let prompt: string | undefined;
    if (ctx._prompt) {
      const value = parseLiteral(ctx._prompt.text!);
      if (!isStringValue(value)) {
        throw new Error("expecting string");
      }
      prompt = value.string;
    }
    const variable = this.getVariable(ctx.variable_or_function_call());
    if (!isStringType(variable.type)) {
      throw ParseError.fromToken(variable.token, "Type mismatch");
    }
    const variables: Variable[] = [variable];
    this.addStatement(statements.lineInput({token, sameLine, mark, prompt, variables}));
  }

  override enterLine_input_file_statement = (ctx: parser.Line_input_file_statementContext) => {
    const token = ctx.start!;
    const fileNumber = this.compileExpression(ctx.file_number(), ctx.file_number().start!, { tag: TypeTag.INTEGER });
    const variable = this.getVariable(ctx.variable_or_function_call());
    if (!isStringType(variable.type)) {
      throw ParseError.fromToken(variable.token, "Type mismatch");
    }
    const variables: Variable[] = [variable];
    this.addStatement(statements.lineInput({token, fileNumber, variables}));
  }

  override enterIoctl_statement = (ctx: parser.Ioctl_statementContext) => {}

  override enterKey_statement = (ctx: parser.Key_statementContext) => {
    const token = ctx.start!;
    const operation = ctx.LIST() ? KeyStatementOperation.LIST :
      ctx.ON() ? KeyStatementOperation.ON :
      ctx.OFF() ? KeyStatementOperation.OFF :
      KeyStatementOperation.BIND;
    let keyNumber: parser.ExprContext | undefined;
    let stringExpr: parser.ExprContext | undefined;
    if (operation === KeyStatementOperation.BIND) {
      keyNumber = this.compileExpression(ctx._keynum!, ctx._keynum!.start!, { tag: TypeTag.INTEGER });
      stringExpr = this.compileExpression(ctx._bind!, ctx._bind!.start!, { tag: TypeTag.STRING });
    }
    this.addStatement(statements.key({token, operation, keyNumber, stringExpr}))
  }

  override enterLine_statement = (ctx: parser.Line_statementContext) => {}

  override enterLocate_statement = (ctx: parser.Locate_statementContext) => {
    const token = ctx.start!;
    const row = ctx._row && this.compileExpression(ctx._row, ctx._row.start!, { tag: TypeTag.INTEGER });
    const column = ctx._column && this.compileExpression(ctx._column, ctx._column.start!, { tag: TypeTag.INTEGER });
    const cursor = ctx._cursor && this.compileExpression(ctx._cursor, ctx._cursor.start!, { tag: TypeTag.INTEGER });
    const start = ctx._start && this.compileExpression(ctx._start, ctx._start.start!, { tag: TypeTag.INTEGER });
    const stop = ctx._stop && this.compileExpression(ctx._stop, ctx._stop.start!, { tag: TypeTag.INTEGER });
    this.addStatement(statements.locate(token, row, column, cursor, start, stop));
  }

  override enterLock_statement = (ctx: parser.Lock_statementContext) => {}

  override enterLset_statement = (ctx: parser.Lset_statementContext) => {
    const token = ctx.start!;
    const variableCtx = ctx.variable_or_function_call();
    const dest = this.getVariable(variableCtx);
    const expr = ctx.expr();
    if (dest.type.tag === TypeTag.RECORD) {
      const source = this.getVariableFromExpression(expr);
      if (!source || source.type.tag !== TypeTag.RECORD) {
        throw ParseError.fromToken(ctx.start!, "Type mismatch");
      }
      this.addStatement(statements.lsetRecord(dest, source));
      return;
    }
    if (!isStringType(dest.type)) {
      throw ParseError.fromToken(variableCtx.start!, "Type mismatch");
    }
    const stringExpr = this.compileExpression(expr, expr.start!, { tag: TypeTag.STRING });
    this.addStatement(statements.lsetString(token, dest, stringExpr));
  }

  override enterRset_statement = (ctx: parser.Rset_statementContext) => {
    const token = ctx.start!;
    const variableCtx = ctx.variable_or_function_call();
    const variable = this.getVariable(variableCtx);
    if (!isStringType(variable.type)) {
      throw ParseError.fromToken(variableCtx.start!, "Type mismatch");
    }
    const expr = ctx.expr();
    const stringExpr = this.compileExpression(expr, expr.start!, { tag: TypeTag.STRING });
    this.addStatement(statements.rsetString(token, variable, stringExpr));
  }

  override enterName_statement = (ctx: parser.Name_statementContext) => {
    const oldPathExpr = this.compileExpression(ctx._oldpath!, ctx._oldpath!.start!, { tag: TypeTag.STRING });
    const newPathExpr = this.compileExpression(ctx._newpath!, ctx._newpath!.start!, { tag: TypeTag.STRING });
    this.addStatement(statements.name(ctx.start!, oldPathExpr, newPathExpr));
  }

  override enterOn_error_statement = (ctx: parser.On_error_statementContext) => {}

  private getEventType(ctx: parser.On_event_gosub_statementContext | parser.Event_control_statementContext): EventType {
    const eventType = ctx.TIMER() ? EventType.TIMER :
      ctx.STRIG() ? EventType.JOYSTICK :
      ctx.KEY() ? EventType.KEYBOARD :
      ctx.PEN() ? EventType.PEN :
      ctx.PLAY() ? EventType.PLAY :
      undefined;
    if (eventType === undefined) {
      throw new Error("unimplemented");
    }
    return eventType;
  }

  override enterOn_event_gosub_statement = (ctx: parser.On_event_gosub_statementContext) => {
    const token = ctx.start!;
    const paramExpr = ctx.expr();
    let param: parser.ExprContext | undefined;
    if (paramExpr) {
      param = this.compileExpression(paramExpr, paramExpr.start!, { tag: TypeTag.INTEGER });
    }
    const eventType = this.getEventType(ctx);
    this.addStatement(statements.eventHandler(token, eventType, param));
  }

  override enterEvent_control_statement = (ctx: parser.Event_control_statementContext) => {
    const token = ctx.start!;
    const paramExpr = ctx.expr();
    let param: parser.ExprContext | undefined;
    if (paramExpr) {
      param = this.compileExpression(paramExpr, paramExpr.start!, { tag: TypeTag.INTEGER });
    }
    const state = ctx.ON() ? EventChannelState.ON :
      ctx.OFF() ? EventChannelState.OFF :
      ctx.STEP() ? EventChannelState.TEST :
      EventChannelState.STOPPED;
    const eventType = this.getEventType(ctx);
    this.addStatement(statements.eventControl(token, eventType, param, state));
  }

  override enterOn_expr_gosub_statement = (ctx: parser.On_expr_gosub_statementContext) => {
    const expr = this.compileExpression(ctx.expr(), ctx.start!, { tag: TypeTag.INTEGER });
    this.addStatement(statements.gosubIndex(expr));
  }

  override enterOn_expr_goto_statement = (ctx: parser.On_expr_goto_statementContext) => {
    const expr = this.compileExpression(ctx.expr(), ctx.start!, { tag: TypeTag.INTEGER });
    this.addStatement(statements.gotoIndex(expr));
  }

  override enterOpen_legacy_statement = (ctx: parser.Open_legacy_statementContext) => {}

  override enterOpen_statement = (ctx: parser.Open_statementContext) => {
    const token = ctx.start!;
    const name = this.compileExpression(ctx._file!, ctx._file!.start!, { tag: TypeTag.STRING });
    const fileNumber = this.compileExpression(ctx._filenum!, ctx._filenum!.start!, { tag: TypeTag.INTEGER });
    const mode = ctx.open_mode()?.OUTPUT() ? OpenMode.OUTPUT : 
      ctx.open_mode()?.INPUT() ? OpenMode.INPUT :
      ctx.open_mode()?.APPEND() ? OpenMode.APPEND :
      ctx.open_mode()?.BINARY() ? OpenMode.BINARY :
      OpenMode.RANDOM;
    let recordLength: parser.ExprContext | undefined;
    if (ctx._reclen) {
      recordLength = this.compileExpression(ctx._reclen, ctx._reclen.start!, { tag: TypeTag.INTEGER });
    }
    this.addStatement(statements.open({token, name, fileNumber, mode, recordLength}));
  }

  override enterPaint_statement = (ctx: parser.Paint_statementContext) => {}

  override enterPalette_statement = (ctx: parser.Palette_statementContext) => {
    const token = ctx.start!;
    const attributeExpr = ctx._attribute && this.compileExpression(ctx._attribute, ctx._attribute.start!, { tag: TypeTag.INTEGER });
    const colorExpr = ctx._color && this.compileExpression(ctx._color, ctx._color.start!, { tag: TypeTag.INTEGER });
    let array: Variable | undefined;
    if (ctx._array) {
      array = getTyperContext(ctx).$result;
    } else if (ctx._arrayexpr) {
      const symbol = getTyperContext(ctx._arrayexpr).$symbol;
      if (!symbol || !isVariable(symbol) || !symbol.variable.array) {
        throw ParseError.fromToken(ctx.start!, "Expected: variable");
      }
      if (symbol.variable.type.tag !== TypeTag.INTEGER && symbol.variable.type.tag !== TypeTag.LONG) {
        throw ParseError.fromToken(ctx.start!, "Type mismatch");
      }
      array = this.getVariable(ctx._arrayexpr);
      if (!array) {
        throw ParseError.fromToken(ctx.start!, "Expected: variable");
      }
    }
    this.addStatement(statements.palette(token, attributeExpr, colorExpr, array));
  }

  override enterPlay_statement = (ctx: parser.Play_statementContext) => {
    const token = ctx.start!;
    const commandString = this.compileExpression(ctx.expr(), ctx.expr().start!, { tag: TypeTag.STRING });
    this.addStatement(statements.playStatement(token, commandString));
  }

  override enterLprint_statement = (ctx: parser.Lprint_statementContext) => {
    this.addPrintStatement({ctx, printer: true});
  }

  override enterPrint_statement = (ctx: parser.Print_statementContext) => {
    const fileNumber = ctx.file_number() && this.compileExpression(
        ctx.file_number()!.expr(), ctx.file_number()!.expr().start!, { tag: TypeTag.INTEGER });
    this.addPrintStatement({ctx, fileNumber: fileNumber ?? undefined});
  }

  override enterLprint_using_statement = (ctx: parser.Lprint_using_statementContext) => {
    this.addPrintUsingStatement({ctx, printer: true});
  }

  override enterPrint_using_statement = (ctx: parser.Print_using_statementContext) => {
    const fileNumber = ctx.file_number() && this.compileExpression(
        ctx.file_number()!.expr(), ctx.file_number()!.expr().start!, { tag: TypeTag.INTEGER });
    this.addPrintUsingStatement({ctx, fileNumber: fileNumber ?? undefined});
  }

  private addPrintStatement({ctx, fileNumber, printer}: {
    ctx: parser.Print_statementContext | parser.Lprint_statementContext,
    fileNumber?: parser.ExprContext,
    printer?: boolean
  }) {
    const exprs: PrintExpr[] = [];
    for (const arg of ctx.print_argument()) {
      const token = arg.start!;
      const expr = arg._arg && this.compileExpression(
        arg._arg, arg._arg.start!, { tag: TypeTag.PRINTABLE });
      const spaces = arg._spaces && this.compileExpression(
        arg._spaces, arg._spaces.start!, { tag: TypeTag.INTEGER });
      const tab = arg._tab && this.compileExpression(
        arg._tab, arg._tab.start!, { tag: TypeTag.INTEGER });
      const separator = arg._separator?.text;
      exprs.push({token, expr, spaces, tab, separator});
    }
    const token = ctx.start!;
    this.addStatement(statements.print({token, exprs, fileNumber, printer}));
  }

  private addPrintUsingStatement({ctx, fileNumber, printer}: {
    ctx: parser.Print_using_statementContext | parser.Lprint_using_statementContext,
    fileNumber?: parser.ExprContext,
    printer?: boolean
  }) {
    const exprs: PrintExpr[] = [];
    for (const arg of ctx.print_argument()) {
      const token = arg.start!;
      const expr = arg._arg && this.compileExpression(
        arg._arg, arg._arg.start!, { tag: TypeTag.PRINTABLE });
      const spaces = arg._spaces && this.compileExpression(
        arg._spaces, arg._spaces.start!, { tag: TypeTag.INTEGER });
      const separator = arg._separator?.text;
      exprs.push({token, expr, spaces, separator});
    }
    const token = ctx.start!;
    const format = this.compileExpression(
      ctx._format!, ctx._format!.start!, { tag: TypeTag.STRING })
    this.addStatement(statements.printUsing({token, format, exprs, fileNumber, printer}));
  }

  override enterPset_statement = (ctx: parser.Pset_statementContext) => {
    const token = ctx.start!;
    const step = !!ctx.STEP();
    const x = this.compileExpression(ctx._x!, ctx._x!.start!, { tag: TypeTag.INTEGER });
    const y = this.compileExpression(ctx._y!, ctx._y!.start!, { tag: TypeTag.INTEGER });
    const color = ctx._color && this.compileExpression(ctx._color, ctx._color.start!, { tag: TypeTag.INTEGER });
    this.addStatement(statements.pset(token, step, x, y, color));
  }

  override enterPreset_statement = (ctx: parser.Preset_statementContext) => {
    const token = ctx.start!;
    const step = !!ctx.STEP();
    const x = this.compileExpression(ctx._x!, ctx._x!.start!, { tag: TypeTag.INTEGER });
    const y = this.compileExpression(ctx._y!, ctx._y!.start!, { tag: TypeTag.INTEGER });
    const color = ctx._color && this.compileExpression(ctx._color, ctx._color.start!, { tag: TypeTag.INTEGER });
    this.addStatement(statements.preset(token, step, x, y, color));
  }

  override enterPut_graphics_statement = (ctx: parser.Put_graphics_statementContext) => {}
  override enterResume_statement = (ctx: parser.Resume_statementContext) => {}

  override enterReturn_statement = (ctx: parser.Return_statementContext) => {
    this.addStatement(statements.return_(ctx.start!));
  }

  override enterScreen_statement = (ctx: parser.Screen_statementContext) => {
    const token = ctx.start!;
    const modeExpr = this.compileExpression(ctx._screenmode!, ctx._screenmode!.start!, { tag: TypeTag.INTEGER });
    const colorSwitchExpr = ctx._colorswitch && this.compileExpression(ctx._colorswitch!, ctx._colorswitch!.start!, { tag: TypeTag.INTEGER });
    const activePageExpr = ctx._activepage && this.compileExpression(ctx._activepage!, ctx._activepage!.start!, { tag: TypeTag.INTEGER });
    const visiblePageExpr = ctx._visiblepage && this.compileExpression(ctx._visiblepage!, ctx._visiblepage!.start!, { tag: TypeTag.INTEGER });
    this.addStatement(statements.screenStatement(token, modeExpr, colorSwitchExpr, activePageExpr, visiblePageExpr));
  }

  override enterSeek_statement = (ctx: parser.Seek_statementContext) => {
    const token = ctx.start!;
    const fileNumber = this.compileExpression(ctx._filenum!, ctx._filenum!.start!, { tag: TypeTag.INTEGER });
    const offset = this.compileExpression(ctx._offset!, ctx._offset!.start!, { tag: TypeTag.LONG });
    this.addStatement(statements.seekStatement(token, fileNumber, offset));
  }

  override enterSelect_case_statement = (ctx: parser.Select_case_statementContext) => {
    // First evaluate the test expression, then evaluate each "case" in sequence
    // until one matches.
    // let $testVariable = testexpr
    // test1:
    //   case $testVariable caseExpr -> block1
    //   case $testVariable caseExpr -> block1
    //   case $testVariable caseExpr -> block1
    //   goto test2
    // block1:
    //   ...
    //   goto exit
    // test2:
    //   case $testVariable caseExpr -> block2
    //   case $testVariable caseExpr -> block2
    //   goto test3
    // block2:
    //   ...
    //   goto exit
    // test3: // case else
    // block3:
    //   ...
    // exit:
    const testVariable = getTyperContext(ctx).$test;
    if (!testVariable) {
      throw new Error("missing test");
    }
    const textExpr = this.compileExpression(ctx.expr());
    this.addStatement(statements.let_(testVariable, textExpr));
    const labels = getCodeGeneratorContext(ctx);
    labels.$exitLabel = this.makeSyntheticLabel();
    let nextBranchLabel = this.makeSyntheticLabel();
    for (const block of ctx.case_block()) {
      getCodeGeneratorContext(block).$label = this.makeSyntheticLabel();
      getCodeGeneratorContext(block).$exitLabel = labels.$exitLabel;
      const caseStatement = block.case_statement();
      getCodeGeneratorContext(caseStatement).$label = nextBranchLabel;
      getTyperContext(caseStatement).$test = testVariable;
      nextBranchLabel = this.makeSyntheticLabel();
      getCodeGeneratorContext(caseStatement).$nextBranchLabel = nextBranchLabel;
    }
    const lastBlock = ctx.case_block(ctx.case_block().length - 1);
    if (lastBlock) {
      const lastCase = lastBlock.case_statement();
      getCodeGeneratorContext(lastBlock).$exitLabel = '';
      getCodeGeneratorContext(lastCase).$nextBranchLabel = labels.$exitLabel;
    }
  }

  override exitSelect_case_statement = (ctx: parser.Select_case_statementContext) => {
    const labels = getCodeGeneratorContext(ctx);
    this.addLabelForNextStatement(labels.$exitLabel);
  }

  override enterCase_statement = (ctx: parser.Case_statementContext) => {
    if (!ctx.parent) {
      throw new Error("missing parent");
    }
    const blockLabel = getCodeGeneratorContext(ctx.parent).$label;
    const testVariable = getTyperContext(ctx).$test;
    const labels = getCodeGeneratorContext(ctx);
    this.addLabelForNextStatement(labels.$label);
    for (const caseExpr of ctx.case_expr()) {
      for (const childExpr of caseExpr.expr()) {
        this.compileExpression(childExpr, ctx.start!, testVariable.type);
      }
      this.addStatement(statements.case_(testVariable, caseExpr));
      this.setTargetForCurrentStatement(blockLabel, ctx);
    }
    if (ctx.ELSE()) {
      // Fall through to block.
    } else {
      this.addStatement(statements.goto());
      this.setTargetForCurrentStatement(labels.$nextBranchLabel, ctx);
    }
    this.addLabelForNextStatement(blockLabel);
  }

  override exitCase_block = (ctx: parser.Case_blockContext) => {
    const labels = getCodeGeneratorContext(ctx);
    if (labels.$exitLabel) {
      this.addStatement(statements.goto());
      this.setTargetForCurrentStatement(labels.$exitLabel, ctx);
    }
  }

  override enterStop_statement = (ctx: parser.Stop_statementContext) => {}

  override enterSwap_statement = (ctx: parser.Swap_statementContext) => {
    const a = this.getVariable(ctx._a!);
    const b = this.getVariable(ctx._b!);
    if (!sameType(a.type, b.type)) {
      throw ParseError.fromToken(ctx.start!, "Type mismatch");
    }
    this.addStatement(statements.swap(a, b));
  }

  override enterUnlock_statement = (ctx: parser.Unlock_statementContext) => {}

  override enterView_statement = (ctx: parser.View_statementContext) => {
    const token = ctx.start!;
    const screen = !!ctx.SCREEN();
    const x1 = ctx._x1 && this.compileExpression(ctx._x1, ctx._x1.start!, { tag: TypeTag.INTEGER });
    const y1 = ctx._y1 && this.compileExpression(ctx._y1, ctx._y1.start!, { tag: TypeTag.INTEGER });
    const x2 = ctx._x2 && this.compileExpression(ctx._x2, ctx._x2.start!, { tag: TypeTag.INTEGER });
    const y2 = ctx._y2 && this.compileExpression(ctx._y2, ctx._y2.start!, { tag: TypeTag.INTEGER });
    const color = ctx._color && this.compileExpression(ctx._color, ctx._color.start!, { tag: TypeTag.INTEGER });
    const border = ctx._border && this.compileExpression(ctx._border, ctx._border.start!, { tag: TypeTag.INTEGER });
    this.addStatement(statements.view_(token, screen, x1, y1, x2, y2, color, border));
  }

  override enterView_print_statement = (ctx: parser.View_print_statementContext) => {}

  override enterWhile_wend_statement = (ctx: parser.While_wend_statementContext) => {
    const labels = getCodeGeneratorContext(ctx);
    labels.$exitLabel = this.makeSyntheticLabel();
    labels.$topLabel = this.makeSyntheticLabel();
    this.addLabelForNextStatement(labels.$topLabel);
    const test = this.compileBoolean(ctx.expr()!);
    this.addStatement(statements.while_(test));
    this.setTargetForCurrentStatement(labels.$exitLabel, ctx);
  }

  override exitWhile_wend_statement = (ctx: parser.While_wend_statementContext) => {
    const labels = getCodeGeneratorContext(ctx);
    this.addStatement(statements.goto());
    this.setTargetForCurrentStatement(labels.$topLabel, ctx);
    this.addLabelForNextStatement(labels.$exitLabel);
  }

  override enterWidth_statement = (ctx: parser.Width_statementContext) => {}

  override enterWindow_statement = (ctx: parser.Window_statementContext) => {
    const token = ctx.start!;
    const screen = !!ctx.SCREEN();
    const x1 = ctx._x1 && this.compileExpression(ctx._x1, ctx._x1.start!, { tag: TypeTag.INTEGER });
    const y1 = ctx._y1 && this.compileExpression(ctx._y1, ctx._y1.start!, { tag: TypeTag.INTEGER });
    const x2 = ctx._x2 && this.compileExpression(ctx._x2, ctx._x2.start!, { tag: TypeTag.INTEGER });
    const y2 = ctx._y2 && this.compileExpression(ctx._y2, ctx._y2.start!, { tag: TypeTag.INTEGER });
    this.addStatement(statements.window_(token, screen, x1, y1, x2, y2));
  }

  override enterWrite_statement = (ctx: parser.Write_statementContext) => {
    const fileNumber = ctx.file_number() && this.compileExpression(
        ctx.file_number()!.expr(), ctx.file_number()!.expr().start!, { tag: TypeTag.INTEGER });
    const exprs: PrintExpr[] = [];
    for (const writeExpr of ctx.expr()) {
      const token = writeExpr.start!;
      const expr = this.compileExpression(writeExpr, writeExpr.start!, { tag: TypeTag.PRINTABLE });
      exprs.push({token, expr});
    }
    const token = ctx.start!;
    this.addStatement(statements.write({token, exprs, fileNumber: fileNumber ?? undefined}));
  }

  override enterExit_statement = (ctx: parser.Exit_statementContext) => {
    if (ctx.DEF()) {
      if (!findParent(ctx, parser.Def_fn_statementContext)) {
        throw ParseError.fromToken(ctx.start!, "EXIT DEF not within DEF FN");
      }
      this.addStatement(statements.exitDef());
    } else if (ctx.DO()) {
      const doCtx = findParent(ctx, parser.Do_loop_statementContext);
      if (!doCtx) {
       throw ParseError.fromToken(ctx.start!, "EXIT DO not within DO...LOOP");
      }
      this.addStatement(statements.exitDo());
      this.setTargetForCurrentStatement(doCtx['$exitLabel'], ctx);
    } else if (ctx.FOR()) {
      const forCtx = findParent(ctx, parser.For_next_statementContext);
      if (!forCtx) {
        throw ParseError.fromToken(ctx.start!, "EXIT FOR not within FOR...NEXT");
      }
      this.addStatement(statements.exitFor());
      this.setTargetForCurrentStatement(forCtx['$exitLabel'], ctx);
    } else if (ctx.FUNCTION()) {
      if (!findParent(ctx, parser.Function_statementContext)) {
        throw ParseError.fromToken(ctx.start!, "EXIT FUNCTION not within FUNCTION");
      }
      this.addStatement(statements.exitFunction());
    } else if (ctx.SUB()) {
      if (!findParent(ctx, parser.Sub_statementContext)) {
        throw ParseError.fromToken(ctx.start!, "EXIT SUB not within SUB");
      }
      this.addStatement(statements.exitSub());
    } else {
      throw new Error("invalid block type");
    }
  }

  private addStatement(statement: Statement) {
    this._chunk.statements.push(statement);
  }

  private setTargetForCurrentStatement(label: string, ctx: ParserRuleContext) {
    const currentStatementIndex = this._chunk.statements.length - 1;
    this._chunk.indexToTarget.push([currentStatementIndex, {label, token: ctx.start!}]);
  }

  private addLabelForNextStatement(label: string) {
    const nextStatementIndex = this._chunk.statements.length;
    this._chunk.labelToIndex.set(label, nextStatementIndex);
  }

  private compileBoolean(expr: parser.ExprContext): parser.ExprContext {
    return this.compileExpression(expr, expr.start!, {tag: TypeTag.LONG});
  }

  private getVariableFromExpression(expr: parser.ExprContext): Variable | undefined {
    if (expr.children.length == 1) {
      const child = expr.children[0];
      if (child instanceof parser.Variable_or_function_callContext) {
        const symbol = getTyperContext(child).$symbol;
        if (!isVariable(symbol)) {
          return;
        }
        return this.getVariable(child);
      }
    }
  }

  private getVariable(variableCtx: parser.Variable_or_function_callContext): Variable {
    const symbol = getTyperContext(variableCtx).$symbol;
    if (!isVariable(symbol)) {
      throw ParseError.fromToken(variableCtx.start!, "Expected: variable");
    }
    let variable = symbol.variable;
    if (variable.array) {
      const result = getTyperContext(variableCtx).$result;
      if (!result) {
        throw new Error("missing result variable");
      }
      this.indexArray(variable, variableCtx.start!, variableCtx.argument_list(), result);
      variable = result;
    }
    return variable;
  }

  private compileExpression(expr: parser.ExprContext, token?: Token, resultType?: Type): parser.ExprContext {
    const codeGenerator = this;
    ParseTreeWalker.DEFAULT.walk(new class extends QBasicParserListener {
      override exitVariable_or_function_call = (ctx: parser.Variable_or_function_callContext) => {
        const symbol = getTyperContext(ctx).$symbol;
        if (!symbol) {
          throw new Error("missing symbol");
        }
        if (isBuiltin(symbol)) {
          const builtin = symbol.builtin;
          const result = getTyperContext(ctx).$result;
          if (!result) {
            throw new Error("missing result variable");
          }
          codeGenerator.callBuiltin(builtin, ctx.start!, ctx.argument_list(), result);
          return;
        }
        if (isProcedure(symbol)) {
          const procedure = symbol.procedure;
          const result = getTyperContext(ctx).$result;
          if (!result) {
            throw new Error("missing result variable");
          }
          codeGenerator.call(procedure, ctx.start!, ctx.argument_list(), result);
          return;
        }
        if (isVariable(symbol)) {
          const variable = symbol.variable;
          if (variable.array) {
            const result = getTyperContext(ctx).$result;
            if (!result) {
              throw new Error("missing result variable");
            }
            codeGenerator.indexArray(variable, ctx.start!, ctx.argument_list(), result);
            return;
          }
        }
      }

      override enterDate_function = (ctx: parser.Date_functionContext) => {
        const result = getTyperContext(ctx.parent!).$result;
        if (!result) {
          throw new Error("missing result variable");
        }
        codeGenerator.addStatement(statements.dateFunction(result));
      }

      override enterInput_function = (ctx: parser.Input_functionContext) => {
        const result = getTyperContext(ctx.parent!).$result;
        if (!result) {
          throw new Error("missing result variable");
        }
        const n = codeGenerator.compileExpression(ctx._n!, ctx._n!.start!, { tag: TypeTag.INTEGER });
        const fileNumber = ctx._filenum &&
          codeGenerator.compileExpression(ctx._filenum, ctx._filenum.start!, { tag: TypeTag.INTEGER });
        codeGenerator.addStatement(statements.inputFunction(ctx.start!, n, fileNumber, result));
      }

      override enterInstr_function = (ctx: parser.Instr_functionContext) => {
        const result = getTyperContext(ctx.parent!).$result;
        if (!result) {
          throw new Error("missing result variable");
        }
        const start = ctx._start && codeGenerator.compileExpression(ctx._start!, ctx._start!.start!, {tag: TypeTag.INTEGER })
        const haystack = codeGenerator.compileExpression(ctx._haystack!, ctx._haystack!.start!, { tag: TypeTag.STRING });
        const needle = codeGenerator.compileExpression(ctx._needle!, ctx._needle!.start!, { tag: TypeTag.STRING });
        codeGenerator.addStatement(statements.instr(ctx.start!, start, haystack, needle, result));
      }

      override exitLbound_function = (ctx: parser.Lbound_functionContext) => {
        const result = getTyperContext(ctx.parent!).$result;
        if (!result) {
          throw new Error("missing result variable");
        }
        const array = getTyperContext(ctx).$result;
        if (!array || !array.array) {
          throw new Error("missing array variable");
        }
        codeGenerator.addStatement(statements.lbound(ctx.start!, array, result, ctx._which));
      }

      override enterLen_function = (ctx: parser.Len_functionContext) => {
        const result = getTyperContext(ctx.parent!).$result;
        if (!result) {
          throw new Error("missing result variable");
        }
        const variable = codeGenerator.getVariableFromExpression(ctx.expr());
        let stringExpr: parser.ExprContext | undefined;
        if (!variable) {
          try {
            stringExpr = codeGenerator.compileExpression(ctx.expr(), ctx.expr().start!, {tag: TypeTag.STRING });
          } catch (e: unknown) {
            throw ParseError.fromToken(ctx.expr().start!, "Variable required");
          }
        }
        codeGenerator.addStatement(statements.len(variable, stringExpr, result));
      }

      override enterMid_function = (ctx: parser.Mid_functionContext) => {
        const result = getTyperContext(ctx.parent!).$result;
        if (!result) {
          throw new Error("missing result variable");
        }
        const string = codeGenerator.compileExpression(ctx._string_!, ctx._string_!.start!, {tag: TypeTag.STRING })
        const start = codeGenerator.compileExpression(ctx._start!, ctx._start!.start!, { tag: TypeTag.INTEGER });
        const length = ctx._length && codeGenerator.compileExpression(ctx._length, ctx._length.start!, { tag: TypeTag.INTEGER });
        codeGenerator.addStatement(statements.midFunction(ctx.start!, string, start, length, result));
      }

      override enterPen_function = (ctx: parser.Pen_functionContext) => {
        const result = getTyperContext(ctx.parent!).$result;
        if (!result) {
          throw new Error("missing result variable");
        }
        const n = codeGenerator.compileExpression(ctx.expr(), ctx.expr().start!, { tag: TypeTag.INTEGER });
        codeGenerator.addStatement(
          statements.pen({token: ctx.start!, params: [{expr: n}], result}));
      }

      override enterPlay_function = (ctx: parser.Play_functionContext) => {
        const result = getTyperContext(ctx.parent!).$result;
        if (!result) {
          throw new Error("missing result variable");
        }
        // The PLAY parameter is unused, but must be present and integer typed.
        codeGenerator.compileExpression(ctx.expr(), ctx.expr().start!, { tag: TypeTag.INTEGER });
        codeGenerator.addStatement(statements.playFunction(result));
      }

      override enterSeek_function = (ctx: parser.Seek_functionContext) => {
        const result = getTyperContext(ctx.parent!).$result;
        if (!result) {
          throw new Error("missing result variable");
        }
        const fileNum = codeGenerator.compileExpression(ctx._filenum!, ctx._filenum!.start!, { tag: TypeTag.INTEGER });
        codeGenerator.addStatement(statements.seekFunction(ctx.start!, fileNum, result));
      }

      override enterStrig_function = (ctx: parser.Strig_functionContext) => {
        const result = getTyperContext(ctx.parent!).$result;
        if (!result) {
          throw new Error("missing result variable");
        }
        const n = codeGenerator.compileExpression(ctx.expr(), ctx.expr().start!, { tag: TypeTag.INTEGER });
        codeGenerator.addStatement(
          statements.strig({token: ctx.start!, params: [{expr: n}], result}));
      }

      override enterTime_function = (ctx: parser.Time_functionContext) => {
        const result = getTyperContext(ctx.parent!).$result;
        if (!result) {
          throw new Error("missing result variable");
        }
        codeGenerator.addStatement(statements.timeFunction(result));
      }

      override enterTimer_function = (ctx: parser.Timer_functionContext) => {
        const result = getTyperContext(ctx.parent!).$result;
        if (!result) {
          throw new Error("missing result variable");
        }
        codeGenerator.addStatement(statements.timer(result));
      }

      override exitUbound_function = (ctx: parser.Ubound_functionContext) => {
        const result = getTyperContext(ctx.parent!).$result;
        if (!result) {
          throw new Error("missing result variable");
        }
        const array = getTyperContext(ctx).$result;
        if (!array || !array.array) {
          throw new Error("missing array variable");
        }
        codeGenerator.addStatement(statements.ubound(ctx.start!, array, result, ctx._which));
      }
    }, expr);
    if (resultType && token) {
      const value = typeCheckExpression({expr, resultType});
      if (isError(value)) {
        throw ParseError.fromToken(token, value.errorMessage);
      }
    }
    return expr;
  }
}

type RuleConstructor<T extends ParserRuleContext> = { new (ctx: ParserRuleContext | null, rule: number): T }

function findParent<T extends ParserRuleContext>(
  ctx: ParserRuleContext,
  constructor: RuleConstructor<T>): T | null {
  while (ctx.parent) {
    if (ctx.parent instanceof constructor) {
      return ctx.parent;
    }
    ctx = ctx.parent;
  }
  return null;
}