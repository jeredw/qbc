import * as parser from "../build/QBasicParser.ts";
import * as statements from "./statements/StatementRegistry.ts";
import { QBasicParserListener } from "../build/QBasicParserListener";
import { ParseError } from "./Errors.ts";
import { Program, ProgramChunk } from "./Programs";
import { ParserRuleContext, ParseTreeWalker, Token } from "antlr4ng";
import { Variable } from "./Variables.ts";
import { StackFrame } from "./statements/Call.ts";
import { evaluateExpression } from "./Expressions.ts";
import { reference, isError, getDefaultValueOfType } from "./Values.ts";
import { sameType, splitSigil, Type, TypeTag } from "./Types.ts";
import { isProcedure, isVariable, QBasicSymbol } from "./SymbolTable.ts";
import { getTyperContext } from "./Typer.ts";
import { Statement } from "./statements/Statement.ts";
import { Procedure } from "./Procedures.ts";
import { BranchIndexStatement } from "./statements/Branch.ts";

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

  constructor(program: Program) {
    super();
    this._program = program;
    this._chunk = program.chunks[0];
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
    const expr = this.compileExpression(ctx.expr(), assignee._name!, variable.type);
    this.addStatement(statements.let_(variable, expr));
  }

  override enterCall_statement = (ctx: parser.Call_statementContext) => {
    const procedure = getTyperContext(ctx).$procedure;
    if (!procedure) {
      throw new Error("missing procedure");
    }
    this.call(procedure, ctx.start!, ctx.argument_list());
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
    const stackFrame: StackFrame[] = [];
    for (let i = 0; i < args.length; i++) {
      const parseExpr = args[i].expr();
      if (!parseExpr) {
        throw new Error("unimplemented");
      }
      const parameter = procedure.parameters[i];
      const variable = getVariableReference(parseExpr);
      if (variable) {
        // Type must match exactly for pass by reference.
        if (!sameType(variable.type, parameter.type)) {
          throw ParseError.fromToken(args[i].start!, "Parameter type mismatch");
        }
        stackFrame.push({variable: parameter, value: reference(variable)});
      } else {
        const expr = this.compileExpression(parseExpr, args[i].start!, procedure.parameters[i].type);
        stackFrame.push({variable: parameter, expr});
      }
    }
    if (procedure.result && result) {
      stackFrame.push({variable: procedure.result, value: reference(result)});
    }
    const locals = this._program.chunks[procedure.programChunkIndex].symbols.variables();
    for (const variable of locals) {
      // TODO: Don't overwrite statics.
      if (!variable.isParameter && (!result || variable.name != result.name)) {
        stackFrame.push({variable, value: getDefaultValueOfType(variable.type)});
      }
    }
    this.addStatement(statements.call(procedure.programChunkIndex, stackFrame));
  }

  override enterError_statement = (ctx: parser.Error_statementContext) => {}
  override enterEvent_control_statement = (ctx: parser.Event_control_statementContext) => {}
  override enterCircle_statement = (ctx: parser.Circle_statementContext) => {}
  override enterClear_statement = (ctx: parser.Clear_statementContext) => {}
  override enterClose_statement = (ctx: parser.Close_statementContext) => {}
  override enterColor_statement = (ctx: parser.Color_statementContext) => {}
  override enterCommon_statement = (ctx: parser.Common_statementContext) => {}
  override enterData_statement = (ctx: parser.Data_statementContext) => {}
  override enterDef_seg_statement = (ctx: parser.Def_seg_statementContext) => {}

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

  override enterField_statement = (ctx: parser.Field_statementContext) => {}

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
      throw new Error("missing limit");
    }
    const end = ctx._end;
    if (!end) {
      throw new Error("missing end expr");
    }
    const endExpr = this.compileExpression(end, end.start!, counter.type);
    this.addStatement(statements.let_(endVariable, endExpr));

    const incrementVariable = getTyperContext(ctx).$increment;
    if (!incrementVariable) {
      throw new Error("missing increment");
    }
    if (ctx.STEP()) {
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
      throw new Error("missing limit");
    }
    const incrementVariable = getTyperContext(ctx).$increment;
    if (!incrementVariable) {
      throw new Error("missing increment");
    }

    const labels = getCodeGeneratorContext(ctx);
    this.addStatement(statements.next(ctx.start!, counter, endVariable, ctx.STEP() && incrementVariable));
    this.setTargetForCurrentStatement(labels.$topLabel, ctx);
    this.addLabelForNextStatement(labels.$exitLabel);
  }

  override enterGet_graphics_statement = (ctx: parser.Get_graphics_statementContext) => {}
  override enterGet_io_statement = (ctx: parser.Get_io_statementContext) => {}

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

  override enterInput_statement = (ctx: parser.Input_statementContext) => {}
  override enterIoctl_statement = (ctx: parser.Ioctl_statementContext) => {}
  override enterKey_statement = (ctx: parser.Key_statementContext) => {}
  override enterLine_statement = (ctx: parser.Line_statementContext) => {}
  override enterLine_input_statement = (ctx: parser.Line_input_statementContext) => {}
  override enterLocate_statement = (ctx: parser.Locate_statementContext) => {}
  override enterLock_statement = (ctx: parser.Lock_statementContext) => {}
  override enterLprint_statement = (ctx: parser.Lprint_statementContext) => {}
  override enterLprint_using_statement = (ctx: parser.Lprint_using_statementContext) => {}
  override enterLset_statement = (ctx: parser.Lset_statementContext) => {}
  override enterMid_statement = (ctx: parser.Mid_statementContext) => {}
  override enterName_statement = (ctx: parser.Name_statementContext) => {}
  override enterOn_error_statement = (ctx: parser.On_error_statementContext) => {}
  override enterOn_event_gosub_statement = (ctx: parser.On_event_gosub_statementContext) => {}

  override enterOn_expr_gosub_statement = (ctx: parser.On_expr_gosub_statementContext) => {
    const expr = this.compileExpression(ctx.expr(), ctx.start!, { tag: TypeTag.INTEGER });
    this.addStatement(statements.gosubIndex(expr));
  }

  override enterOn_expr_goto_statement = (ctx: parser.On_expr_goto_statementContext) => {
    const expr = this.compileExpression(ctx.expr(), ctx.start!, { tag: TypeTag.INTEGER });
    this.addStatement(statements.gotoIndex(expr));
  }

  override enterOpen_legacy_statement = (ctx: parser.Open_legacy_statementContext) => {}
  override enterOpen_statement = (ctx: parser.Open_statementContext) => {}
  override enterPaint_statement = (ctx: parser.Paint_statementContext) => {}
  override enterPalette_statement = (ctx: parser.Palette_statementContext) => {}
  override enterPlay_statement = (ctx: parser.Play_statementContext) => {}
  override enterPreset_statement = (ctx: parser.Preset_statementContext) => {}

  override enterPrint_statement = (ctx: parser.Print_statementContext) => {
    for (const expr of ctx.expr()) {
      this.compileExpression(expr);
    }
    this.addStatement(statements.print(ctx));
  }

  override enterPrint_using_statement = (ctx: parser.Print_using_statementContext) => {}
  override enterPset_statement = (ctx: parser.Pset_statementContext) => {}
  override enterPut_graphics_statement = (ctx: parser.Put_graphics_statementContext) => {}
  override enterPut_io_statement = (ctx: parser.Put_io_statementContext) => {}
  override enterRead_statement = (ctx: parser.Read_statementContext) => {}
  override enterRem_statement = (ctx: parser.Rem_statementContext) => {}
  override enterResume_statement = (ctx: parser.Resume_statementContext) => {}

  override enterReturn_statement = (ctx: parser.Return_statementContext) => {
    this.addStatement(statements.return_(ctx.start!));
  }

  override enterRset_statement = (ctx: parser.Rset_statementContext) => {}
  override enterScreen_statement = (ctx: parser.Screen_statementContext) => {}
  override enterSeek_statement = (ctx: parser.Seek_statementContext) => {}

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

  override enterShared_statement = (ctx: parser.Shared_statementContext) => {}
  override enterStatic_statement = (ctx: parser.Static_statementContext) => {}
  override enterStop_statement = (ctx: parser.Stop_statementContext) => {}
  override enterUnlock_statement = (ctx: parser.Unlock_statementContext) => {}
  override enterView_statement = (ctx: parser.View_statementContext) => {}
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
  override enterWindow_statement = (ctx: parser.Window_statementContext) => {}
  override enterWrite_statement = (ctx: parser.Write_statementContext) => {}

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

  private compileExpression(expr: parser.ExprContext, token?: Token, resultType?: Type): parser.ExprContext {
    const codeGenerator = this;
    ParseTreeWalker.DEFAULT.walk(new class extends QBasicParserListener {
      override exitVariable_or_function_call = (ctx: parser.Variable_or_function_callContext) => {
        const symbol = getTyperContext(ctx).$symbol;
        if (!symbol) {
          throw new Error("missing symbol");
        }
        if (!isProcedure(symbol)) {
          return;
        }
        const procedure = symbol.procedure;
        const result = getTyperContext(ctx).$result;
        if (!result) {
          throw new Error("missing result variable");
        }
        codeGenerator.call(procedure, ctx.start!, ctx.argument_list(), result);
      }
    }, expr);
    if (resultType && token) {
      const value = evaluateExpression({
        expr,
        typeCheck: true,
        resultType
      });
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

function getVariableReference(expr: parser.ExprContext): Variable | undefined {
  if (expr.children.length == 1) {
    const child = expr.children[0];
    if (child instanceof parser.Variable_or_function_callContext) {
      const symbol = child['$symbol'];
      if (isVariable(symbol)) {
        return symbol.variable;
      }
    }
  }
}