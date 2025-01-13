import * as parser from "../build/QBasicParser.ts";
import * as statements from "./statements/StatementRegistry.ts";
import { QBasicParserListener } from "../build/QBasicParserListener.ts";
import { ParserRuleContext, ParseTree, ParseTreeWalker, Token } from "antlr4ng";
import { ParseError } from "./Errors.ts";
import { isProcedure, isVariable, SymbolTable } from "./SymbolTable.ts";
import {
  TypeTag,
  Type,
  UserDefinedType,
  UserDefinedTypeElement,
  splitSigil,
  typeOfDefType,
  typeOfName,
  typeOfSigil,
  sameType,
} from "./Types.ts";
import { ArrayBounds, Variable } from "./Variables.ts";
import { evaluateExpression } from "./Expressions.ts";
import { reference, isError, isNumeric, Value } from "./Values.ts";
import { Statement } from "./statements/Statement.ts";
import { CallStatement, ParameterBinding } from "./statements/Call.ts";

export interface Program {
  chunks: ProgramChunk[];
  types: Map<string, UserDefinedType>;
}

interface TargetRef {
  label: string;
  token: Token;
}

export interface ProgramChunk {
  statements: Statement[];
  indexToTarget: Map<number, TargetRef>;
  labelToIndex: Map<string, number>;
  symbols: SymbolTable;
}

export function analyze(tree: ParseTree): Program {
  const chunker = new ProgramChunker();
  ParseTreeWalker.DEFAULT.walk(chunker, tree);
  return chunker.program;
}

/**
 * This is a catch all semantic analysis pass that collects lists of statements
 * into chunks corresponding to the main program or procedures.  Each program
 * chunk has its own labels and symbol table.
 * 
 * Gotos are inserted to convert loops and blocks into linear code.
 */
class ProgramChunker extends QBasicParserListener {
  private _allLabels: Set<string> = new Set();
  private _firstCharToDefaultType: Map<string, Type> = new Map();
  private _chunk: ProgramChunk;
  private _program: Program;
  private _syntheticLabelIndex = 0;
  private _arrayBaseIndex = 1;
  private _callsToResolve: (() => void)[] = [];

  constructor() {
    super();
    const topLevel = this.makeProgramChunk(new SymbolTable());
    this._chunk = topLevel;
    this._program = {
      chunks: [topLevel],
      types: new Map()
    };
  }

  get program() {
    return this._program;
  }

  override exitProgram = (_ctx: parser.ProgramContext) => {
    this._program.chunks.forEach((chunk) => this.assignTargets(chunk));
    this._callsToResolve.forEach((call) => call());
  }

  private assignTargets(chunk: ProgramChunk) {
    chunk.indexToTarget.forEach((targetRef, statementIndex) => {
      const statement = chunk.statements[statementIndex];
      const targetIndex = chunk.labelToIndex.get(targetRef.label);
      if (targetIndex === undefined) {
        throw ParseError.fromToken(targetRef.token, "Label not defined");
      }
      statement.targetIndex = targetIndex;
    });
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
    return checkUntyped(stripped.toLowerCase(), ctx, "Expected: label or line number");
  }

  private makeProgramChunk(symbols: SymbolTable): ProgramChunk {
    return {statements: [], labelToIndex: new Map(), indexToTarget: new Map(), symbols};
  }

  override enterFunction_statement = (ctx: parser.Function_statementContext) => {
    const [name, sigil] = splitSigil(ctx.ID().getText().toLowerCase());
    const parameters = this.parseParameterList(ctx.parameter_list());
    try {
      this._chunk.symbols.defineProcedure({
        name,
        returnType: sigil ? typeOfSigil(sigil) : this.getDefaultType(name),
        parameters: parameters.map((ctxAndVariable) => ctxAndVariable[1]),
        staticStorage: !!ctx.STATIC(),
        programChunkIndex: this._program.chunks.length,
      });
    } catch (error: any) {
      throw ParseError.fromToken(ctx.ID().symbol, error.message);
    }
    // A label on a function is attached to the first statement of the function.
    this._chunk = this.makeProgramChunk(new SymbolTable(this._chunk.symbols));
    this._program.chunks.push(this._chunk);
    this.installParameters(parameters);
  }

  override enterDef_fn_statement = (ctx: parser.Def_fn_statementContext) => {
    const rawName = ctx._name!.text!.toLowerCase();
    // Correct "def fn foo" to "def fnfoo".
    const fnPrefixed = rawName.startsWith('fn') ? rawName : `fn${rawName}`;
    const [name, sigil] = splitSigil(fnPrefixed);
    const returnType = sigil ? typeOfSigil(sigil) : this.getDefaultType(name);
    const parameters = this.parseDefFnParameterList(ctx.def_fn_parameter_list());
    try {
      this._chunk.symbols.defineFn({
        name,
        returnType,
        parameters: parameters.map((ctxAndVariable) => ctxAndVariable[1]),
        programChunkIndex: this._program.chunks.length,
      });
    } catch (error: any) {
      throw ParseError.fromToken(ctx._name!, error.message);
    }
    // TODO: only params and statics get local entries in a def fn
    this._chunk = this.makeProgramChunk(new SymbolTable(this._chunk.symbols));
    this._program.chunks.push(this._chunk);
    this.installParameters(parameters);
  }

  override enterSub_statement = (ctx: parser.Sub_statementContext) => {
    const name = getUntypedId(ctx.untyped_id(), {allowPeriods: true});
    const parameters = this.parseParameterList(ctx.parameter_list());
    try {
      this._chunk.symbols.defineProcedure({
        name,
        parameters: parameters.map((ctxAndVariable) => ctxAndVariable[1]),
        staticStorage: !!ctx.STATIC(),
        programChunkIndex: this._program.chunks.length
      });
    } catch (error: any) {
      throw ParseError.fromToken(ctx.untyped_id().start!, error.message);
    }
    // A label on a sub is attached to the first statement of the sub.
    this._chunk = this.makeProgramChunk(new SymbolTable(this._chunk.symbols));
    this._program.chunks.push(this._chunk);
    this.installParameters(parameters);
  }

  private installParameters(parameters: [ParserRuleContext, Variable][]) {
    for (const [paramCtx, param] of parameters) {
      try {
        this._chunk.symbols.defineVariable(param);
      } catch (error: any) {
        throw ParseError.fromToken(paramCtx.start!, error.message);
      }
    }
  }

  private exitProcedure = (_ctx: ParserRuleContext) => {
    this._chunk = this._program.chunks[0];
  }

  override exitFunction_statement = this.exitProcedure;
  override exitDef_fn_statement = this.exitProcedure;
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
    endIf['$label'] = this.makeSyntheticLabel();
    const labelBranch = (branch: ParserRuleContext) => {
      const label = this.makeSyntheticLabel();
      branch['$label'] = label;
      prevBranch['$nextBranchLabel'] = label;
      branch['$endIfLabel'] = endIf['$label'];
      prevBranch = branch;
    };
    for (const elseIf of ctx.elseif_block_statement()) {
      labelBranch(elseIf);
    }
    const elseBlock = ctx.else_block_statement();
    if (elseBlock) {
      labelBranch(elseBlock);
    }
    prevBranch['$nextBranchLabel'] = endIf['$label'];
    this.addStatement(statements.if_(this.checkBoolean(ctx.expr())));
    this.setTargetForCurrentStatement(ctx['$nextBranchLabel'], ctx);
  }

  override enterElseif_block_statement = (ctx: parser.Elseif_block_statementContext) => {
    this.addStatement(statements.goto());
    this.setTargetForCurrentStatement(ctx['$endIfLabel'], ctx);
    this.addLabelForNextStatement(ctx['$label']);
    this.addStatement(statements.elseIf(this.checkBoolean(ctx.expr())));
    this.setTargetForCurrentStatement(ctx['$nextBranchLabel'], ctx);
  }

  override enterElse_block_statement = (ctx: parser.Else_block_statementContext) => {
    this.addStatement(statements.goto());
    this.setTargetForCurrentStatement(ctx['$endIfLabel'], ctx);
    this.addLabelForNextStatement(ctx['$label']);
  }

  override enterEnd_if_statement = (ctx: parser.End_if_statementContext) => {
    this.addLabelForNextStatement(ctx['$label']);
  }

  override enterOption_statement = (ctx: parser.Option_statementContext) => {}

  override enterVariable_or_function_call = (ctx: parser.Variable_or_function_callContext) => {
    const [name, sigil] = splitSigil(ctx._name!.text!);
    const type = sigil ? typeOfSigil(sigil) : this.getDefaultType(name);
    const symbol = this._chunk.symbols.lookupOrDefineVariable({
      name,
      type,
      isDefaultType: !sigil,
      numDimensions: 0  // TODO arrays
    });
    ctx['$symbol'] = symbol;
  }

  /*override exitVariable_or_function_call = (ctx: parser.Variable_or_function_callContext) => {
    const symbol = ctx['$symbol'];
    if (!isProcedure(symbol)) {
      return;
    }
    const procedure = symbol.procedure;
  }*/

  override exitAssignment_statement = (ctx: parser.Assignment_statementContext) => {
    const assignee = ctx.variable_or_function_call();
    const symbol = assignee['$symbol'];
    if (!symbol) {
      throw new Error("missing symbol");
    }
    // TODO: Support assignment to function name in functions.
    if (!isVariable(symbol)) {
      throw ParseError.fromToken(assignee._name!, "Duplicate definition");
    }
    const expr = ctx.expr();
    const value = evaluateExpression({
      expr,
      typeCheck: true,
      resultType: symbol.variable.type
    });
    if (isError(value)) {
      throw ParseError.fromToken(assignee._name!, value.errorMessage);
    }
    this.addStatement(statements.let_(symbol.variable, expr));
  }

  override enterCall_statement = (ctx: parser.Call_statementContext) => {
    const name = getUntypedId(ctx.untyped_id(), {allowPeriods: true});
    const call = statements.call(-1);
    this._callsToResolve.push(() => this.resolveProcedure(ctx.start!, ctx.argument_list(), call, name));
    this.addStatement(call);
  }

  private resolveProcedure(token: Token, argumentListCtx: parser.Argument_listContext | null, statement: CallStatement, name: string) {
    const procedure = this._chunk.symbols.lookupProcedure(name);
    if (!procedure) {
      throw ParseError.fromToken(token, "Subprogram not defined");
    }
    if (procedure.returnType) {
      throw ParseError.fromToken(token, "Duplicate definition");
    }
    const args = argumentListCtx?.argument() ?? [];
    if (args.length != procedure.parameters.length) {
      throw ParseError.fromToken(token, "Argument-count mismatch");
    }
    const parameterBindings: ParameterBinding[] = [];
    for (let i = 0; i < args.length; i++) {
      const expr = args[i].expr();
      if (!expr) {
        throw new Error("unimplemented");
      }
      const parameter = procedure.parameters[i];
      const variable = getVariableReference(expr);
      if (variable) {
        // Type must match exactly for pass by reference.
        if (!sameType(variable.type, parameter.type)) {
          throw ParseError.fromToken(args[i].start!, "Parameter type mismatch");
        }
        parameterBindings.push({parameter, value: reference(variable)});
      } else {
        const value = evaluateExpression({
          expr,
          typeCheck: true,
          resultType: procedure.parameters[i].type,
        });
        if (isError(value)) {
          throw ParseError.fromToken(args[i].start!, value.errorMessage);
        }
        parameterBindings.push({parameter, expr});
      }
    }
    statement.chunkIndex = procedure.programChunkIndex;
    statement.parameterBindings = parameterBindings;
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

  override enterDim_statement = (ctx: parser.Dim_statementContext) => {
    for (const dim of ctx.dim_variable()) {
      const arrayDimensions = this.getArrayBounds(dim.dim_array_bounds())
      if (arrayDimensions.some((bounds) => bounds.lower === undefined || bounds.upper == undefined)) {
        throw new Error("TODO: dynamic arrays");
      }
      const dimensions = {...arrayDimensions.length ? {arrayDimensions} : {}};
      if (!!dim.AS()) {
        const asType = this.getType(dim.type_name()!);
        const allowPeriods = asType.tag != TypeTag.RECORD;
        const name = getUntypedId(dim.untyped_id()!, {allowPeriods});
        try {
          this._chunk.symbols.defineVariable({
            name, type: asType, isAsType: true, ...dimensions
          });
        } catch (error: any) {
          throw ParseError.fromToken(dim.untyped_id()!.start!, error.message);
        }
      } else {
        const [name, sigil] = splitSigil(dim.ID()?.getText()!);
        const asType = this._chunk.symbols.getAsType(name);
        const type = sigil ? typeOfSigil(sigil) :
          // So DIM x AS STRING, x(50) fails with "AS clause required".
          asType ? asType :
          this.getDefaultType(name);
        if (asType) {
          // DIM...AS followed by DIM without AS for the same name always fails.
          if (sameType(type, asType)) {
            throw ParseError.fromToken(dim.ID()!.symbol, "AS clause required");
          }
          throw ParseError.fromToken(dim.ID()!.symbol, "Duplicate definition");
        }
        try {
          this._chunk.symbols.defineVariable({
            name, type, ...dimensions,
          });
        } catch (error: any) {
          throw ParseError.fromToken(dim.ID()!.symbol, error.message);
        }
      }
    }
  }

  private getArrayBounds(ctx: parser.Dim_array_boundsContext | null): ArrayBounds[] {
    if (ctx == null) {
      return [];
    }
    const tryToEvaluateAsConstant = (expr: parser.ExprContext) => {
      let result: Value | undefined;
      try {
        result = evaluateExpression({
          expr,
          constantExpression: true,
          resultType: { tag: TypeTag.LONG },
        });
      } catch (error: any) {
        // Thrown errors from evaluateExpression() mean this is not a constant
        // expression.  This array bound must be dynamic, so swallow the error
        // and return undefined.
        return;
      }
      // Error values mean the expression had some known issue, like a type
      // mismatch or division by zero.
      if (isError(result)) {
        throw ParseError.fromToken(expr.start!, result.errorMessage);
      }
      if (isNumeric(result)) {
        return result.number;
      }
    };
    return ctx.dim_subscript().map((range) => {
      const lower = range._lower ?
          tryToEvaluateAsConstant(range._lower) :
          this._arrayBaseIndex;  // TODO: option base
      const upper = tryToEvaluateAsConstant(range._upper!);
      return {lower, upper};
    });
  }

  override enterDo_loop_statement = (ctx: parser.Do_loop_statementContext) => {
    ctx['$exitLabel'] = this.makeSyntheticLabel();
    ctx['$topLabel'] = this.makeSyntheticLabel();
    this.addLabelForNextStatement(ctx['$topLabel']);
    const condition = ctx.do_condition();
    if (condition) {
      const isWhile = !!condition.WHILE();
      const expr = this.checkBoolean(condition.expr()!);
      this.addStatement(statements.do_(isWhile, expr));
      this.setTargetForCurrentStatement(ctx['$exitLabel'], ctx);
    }
  }

  override exitDo_loop_statement = (ctx: parser.Do_loop_statementContext) => {
    const condition = ctx.loop_condition();
    if (condition) {
      const isWhile = !!condition.WHILE();
      const expr = this.checkBoolean(condition.expr()!);
      this.addStatement(statements.loop(isWhile, expr));
      this.setTargetForCurrentStatement(ctx['$topLabel'], ctx);
    } else {
      this.addStatement(statements.goto());
      this.setTargetForCurrentStatement(ctx['$topLabel'], ctx);
    }
    this.addLabelForNextStatement(ctx['$exitLabel']);
  }

  override enterEnd_statement = (ctx: parser.End_statementContext) => {}
  override enterField_statement = (ctx: parser.Field_statementContext) => {}

  override enterFor_next_statement = (ctx: parser.For_next_statementContext) => {
  }

  override exitFor_next_statement = (ctx: parser.For_next_statementContext) => {
  }

  override enterGet_graphics_statement = (ctx: parser.Get_graphics_statementContext) => {}
  override enterGet_io_statement = (ctx: parser.Get_io_statementContext) => {}

  override enterGosub_statement = (ctx: parser.Gosub_statementContext) => {
    this.addStatement(statements.gosub());
  }

  override enterGoto_statement = (ctx: parser.Goto_statementContext) => {
    this.addStatement(statements.goto());
  }

  override enterIf_inline_statement = (ctx: parser.If_inline_statementContext) => {}
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
  override enterOn_expr_gosub_statement = (ctx: parser.On_expr_gosub_statementContext) => {}
  override enterOn_expr_goto_statement = (ctx: parser.On_expr_goto_statementContext) => {}
  override enterOpen_legacy_statement = (ctx: parser.Open_legacy_statementContext) => {}
  override enterOpen_statement = (ctx: parser.Open_statementContext) => {}
  override enterPaint_statement = (ctx: parser.Paint_statementContext) => {}
  override enterPalette_statement = (ctx: parser.Palette_statementContext) => {}
  override enterPlay_statement = (ctx: parser.Play_statementContext) => {}
  override enterPreset_statement = (ctx: parser.Preset_statementContext) => {}

  override enterPrint_statement = (ctx: parser.Print_statementContext) => {
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
  override enterSelect_case_statement = (ctx: parser.Select_case_statementContext) => {}
  override enterCase_statement = (ctx: parser.Case_statementContext) => {}
  override enterEnd_select_statement = (ctx: parser.End_select_statementContext) => {}
  override enterShared_statement = (ctx: parser.Shared_statementContext) => {}
  override enterStatic_statement = (ctx: parser.Static_statementContext) => {}
  override enterStop_statement = (ctx: parser.Stop_statementContext) => {}
  override enterUnlock_statement = (ctx: parser.Unlock_statementContext) => {}
  override enterView_statement = (ctx: parser.View_statementContext) => {}
  override enterView_print_statement = (ctx: parser.View_print_statementContext) => {}

  override enterWhile_wend_statement = (ctx: parser.While_wend_statementContext) => {
    ctx['$exitLabel'] = this.makeSyntheticLabel();
    ctx['$topLabel'] = this.makeSyntheticLabel();
    const condition = this.checkBoolean(ctx.expr()!);
    this.addLabelForNextStatement(ctx['$topLabel']);
    this.addStatement(statements.while_(condition));
    this.setTargetForCurrentStatement(ctx['$exitLabel'], ctx);
  }

  override exitWhile_wend_statement = (ctx: parser.While_wend_statementContext) => {
    this.addStatement(statements.goto());
    this.setTargetForCurrentStatement(ctx['$topLabel'], ctx);
    this.addLabelForNextStatement(ctx['$exitLabel']);
  }

  override enterWidth_statement = (ctx: parser.Width_statementContext) => {}
  override enterWindow_statement = (ctx: parser.Window_statementContext) => {}
  override enterWrite_statement = (ctx: parser.Write_statementContext) => {}

  private checkNoExecutableStatements(ctx: ParserRuleContext) {
    for (const statement of this._chunk.statements) {
      throw ParseError.fromToken(ctx.start!, "COMMON and DECLARE must precede executable statements");
    }
  }

  override enterDeclare_statement = (ctx: parser.Declare_statementContext) => {
    this.checkNoExecutableStatements(ctx);
    // TODO: Check for mismatched declarations.
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

  override enterDeftype_statement = (ctx: parser.Deftype_statementContext) => {
    const keyword = ctx.children[0].getText();
    const type = typeOfDefType(keyword);
    for (const letterRange of ctx.letter_range()) {
      const first = firstCharOfId(letterRange._first!.text!).charCodeAt(0);
      // Ranges can be just a single character.
      const second = letterRange._second ?
        firstCharOfId(letterRange._second.text!).charCodeAt(0) :
        first;
      // Ranges may be flipped.
      const start = Math.min(first, second);
      const end = Math.max(first, second);
      for (let i = start; i <= end; i++) {
        this._firstCharToDefaultType.set(String.fromCharCode(i), type);
      }
    }
  }

  override enterType_statement = (ctx: parser.Type_statementContext) => {
    const nameCtx = ctx.untyped_id() ?? ctx.untyped_fnid();
    const name = getUntypedId(nameCtx!, {allowPeriods: false});
    const elements: UserDefinedTypeElement[] = [];
    for (const elementCtx of ctx.type_element()) {
      const elementNameCtx = elementCtx.untyped_id() ?? elementCtx.untyped_fnid();
      const elementName = getUntypedId(elementNameCtx!, {allowPeriods: false});
      const typeNameCtx = elementCtx.type_name_for_type_element();
      const elementType = this.getType(typeNameCtx);
      elements.push({name: elementName, type: elementType});
    }
    this._program.types.set(name, {tag: TypeTag.RECORD, name, elements});
  }

  override enterConst_statement = (ctx: parser.Const_statementContext) => {
    for (const assignment of ctx.const_assignment()) {
      const [name, sigil] = splitSigil(assignment.ID().getText());
      const value = evaluateExpression({
        expr: assignment.const_expr().expr(),
        constantExpression: true,
        ...(sigil ? {resultType: typeOfSigil(sigil)} : {}),
      });
      if (isError(value)) {
        throw ParseError.fromToken(assignment.ID().symbol, value.errorMessage);
      }
      try {
        this._chunk.symbols.defineConstant(name, value);
      } catch (error: any) {
        throw ParseError.fromToken(assignment.ID().symbol, error.message);
      }
    }
  }

  private addStatement(statement: Statement) {
    this._chunk.statements.push(statement);
  }

  private setTargetForCurrentStatement(label: string, ctx: ParserRuleContext) {
    const currentStatementIndex = this._chunk.statements.length - 1;
    this._chunk.indexToTarget.set(currentStatementIndex, {label, token: ctx.start!});
  }

  private addLabelForNextStatement(label: string) {
    const nextStatementIndex = this._chunk.statements.length;
    this._chunk.labelToIndex.set(label, nextStatementIndex);
  }

  private parseParameterList(ctx: parser.Parameter_listContext | null): [ParserRuleContext, Variable][] {
    return ctx?.parameter().map((param) => this.parseParameter(param)) ?? [];
  }

  private parseDefFnParameterList(ctx: parser.Def_fn_parameter_listContext | null): [ParserRuleContext, Variable][] {
    return ctx?.def_fn_parameter().map((param) => this.parseParameter(param)) ?? [];
  }

  private parseParameter(ctx: parser.ParameterContext | parser.Def_fn_parameterContext): [ParserRuleContext, Variable] {
    const nameCtx = ctx.untyped_id();
    const rawName = nameCtx ? getUntypedId(nameCtx, {allowPeriods: true}) : ctx.ID()!.getText();
    const [name, sigil] = splitSigil(rawName);
    const asTypeCtx = ctx instanceof parser.ParameterContext ?
      ctx.type_name_for_parameter() :
      ctx.type_name_for_def_fn_parameter();
    const typeSpec: Type = sigil ? typeOfSigil(sigil) :
      asTypeCtx ? this.getType(asTypeCtx) :
      this.getDefaultType(name);
    const type: Type = (ctx instanceof parser.ParameterContext && ctx.array_declaration()) ?
      {tag: TypeTag.ARRAY, elementType: typeSpec} :
      typeSpec;
    return [ctx, {type, name, isAsType: !!asTypeCtx}];
  }

  private getType(ctx: ParserRuleContext): Type {
    if (ctx.children.length != 1) {
      throw new Error('expecting exactly one child');
    }
    const child = ctx.children[0];
    if (child instanceof parser.Untyped_idContext || child instanceof parser.Untyped_fnidContext) {
      const typeName = getUntypedId(child, {allowPeriods: false});
      const type = this.program.types.get(typeName);
      if (!type) {
        throw ParseError.fromToken(ctx.start!, "Type not defined");
      }
      return type;
    }
    if (child instanceof parser.Fixed_stringContext) {
      const fixedString = child as parser.Fixed_stringContext;
      const maxLength = parseInt(fixedString.DIGITS()!.getText(), 10);
      return {tag: TypeTag.FIXED_STRING, maxLength};
    }
    return typeOfName(child.getText());
  }

  private getDefaultType(name: string): Type {
    const type = this._firstCharToDefaultType.get(firstCharOfId(name));
    return type ?? {tag: TypeTag.SINGLE};
  }

  private checkBoolean(expr: parser.ExprContext): parser.ExprContext {
    const value = evaluateExpression({
      expr,
      typeCheck: true,
      resultType: {tag: TypeTag.LONG},
    });
    if (isError(value)) {
      throw ParseError.fromToken(expr.start!, value.errorMessage);
    }
    return expr;
  }
}

function firstCharOfId(name: string) {
  const lower = name.toLowerCase();
  return lower.startsWith('fn') ? name.slice(2, 1) : name.slice(0, 1);
}

function getUntypedId(ctx: parser.Untyped_idContext | parser.Untyped_fnidContext, {allowPeriods}: {allowPeriods: boolean}): string {
  const id = checkUntyped(ctx.getText(), ctx, "Identifier cannot end with %, &, !, # or $");
  if (!allowPeriods && id.includes('.')) {
      throw ParseError.fromToken(ctx.start!, "Identifier cannot include period");
  }
  return id.toLowerCase();
}

function checkUntyped(name: string, ctx: ParserRuleContext, message: string) {
  const [_, sigil] = splitSigil(name);
  if (sigil) {
    throw ParseError.fromToken(ctx.start!, message);
  }
  return name;
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