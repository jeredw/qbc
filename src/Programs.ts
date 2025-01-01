import * as parser from "../build/QBasicParser.ts";
import * as statements from "./statements/StatementRegistry.ts";
import { QBasicParserListener } from "../build/QBasicParserListener.ts";
import { ParserRuleContext, ParseTree, ParseTreeWalker, Token } from "antlr4ng";
import { ParseError } from "./Errors.ts";
import { SymbolTable } from "./SymbolTable.ts";
import {
  TypeTag,
  Type,
  UserDefinedType,
  UserDefinedTypeElement,
  splitSigil,
  typeOfDefType,
  typeOfName,
  typeOfSigil,
} from "./Types.ts";
import { Variable } from "./Variables.ts";
import { evaluateExpression } from "./Expressions.ts";
import { isError } from "./Values.ts";
import { Statement } from "./statements/Statement.ts";

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
 */
class ProgramChunker extends QBasicParserListener {
  private _allLabels: Set<string> = new Set();
  private _firstCharToDefaultType: Map<string, Type> = new Map();
  private _chunk: ProgramChunk;
  private _program: Program;

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
    this.addLabel(label);
  }

  override enterTarget = (ctx: parser.TargetContext) => {
    const label = this.canonicalizeLabel(ctx);
    this.addTarget(label, ctx);
  }

  override enterImplicit_goto_target = (ctx: parser.Implicit_goto_targetContext) => {
    this._chunk.statements.push(statements.goto());
    const label = this.canonicalizeLabel(ctx);
    this.addTarget(label, ctx);
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
    if (this._chunk.symbols.has(name)) {
      throw ParseError.fromToken(ctx.ID().symbol, "Duplicate definition");
    }
    this._chunk.symbols.defineProcedure({
      name,
      returnType: sigil ? typeOfSigil(sigil) : this.getDefaultType(name),
      parameters: this.parseParameterList(ctx.parameter_list()),
      staticStorage: !!ctx.STATIC(),
      programChunkIndex: this._program.chunks.length,
    });
    // A label on a function is attached to the first statement of the function.
    this._chunk = this.makeProgramChunk(new SymbolTable(this._chunk.symbols));
    this._program.chunks.push(this._chunk);
  }

  override enterDef_fn_statement = (ctx: parser.Def_fn_statementContext) => {
    const rawName = ctx._name!.text!.toLowerCase();
    // Correct "def fn foo" to "def fnfoo".
    const fnPrefixed = rawName.startsWith('fn') ? rawName : `fn${rawName}`;
    const [name, sigil] = splitSigil(fnPrefixed);
    const returnType = sigil ? typeOfSigil(sigil) : this.getDefaultType(name);
    if (this._chunk.symbols.hasFn(name, returnType.tag)) {
      throw ParseError.fromToken(ctx._name!, "Duplicate definition");
    }
    // Executing def fn marks it visible in the symbol table.  It is part of the
    // current chunk's statement list, since labels on def fn refer to the
    // defining statement in the top level.
    this.addStatement(statements.defFn(name, returnType));
    this._chunk.symbols.defineFn({
      name,
      returnType,
      parameters: this.parseDefFnParameterList(ctx.def_fn_parameter_list()),
      programChunkIndex: this._program.chunks.length,
    });
    this._chunk = this.makeProgramChunk(this._chunk.symbols);
    this._program.chunks.push(this._chunk);
  }

  override enterSub_statement = (ctx: parser.Sub_statementContext) => {
    const name = getUntypedId(ctx.untyped_id());
    if (this._chunk.symbols.has(name)) {
      throw ParseError.fromToken(ctx.untyped_id().start!, "Duplicate definition");
    }
    this._chunk.symbols.defineProcedure({
      name,
      parameters: this.parseParameterList(ctx.parameter_list()),
      staticStorage: !!ctx.STATIC(),
      programChunkIndex: this._program.chunks.length
    });
    // A label on a sub is attached to the first statement of the sub.
    this._chunk = this.makeProgramChunk(new SymbolTable(this._chunk.symbols));
    this._program.chunks.push(this._chunk);
  }

  private exitProcedure = (_ctx: ParserRuleContext) => {
    this._chunk = this._program.chunks[0];
  }

  override exitFunction_statement = this.exitProcedure;
  override exitDef_fn_statement = this.exitProcedure;
  override exitSub_statement = this.exitProcedure;

  override enterEnd_function_statement = (ctx: parser.End_function_statementContext) => {}
  override enterEnd_sub_statement = (ctx: parser.End_sub_statementContext) => {}
  override enterIf_block_statement = (ctx: parser.If_block_statementContext) => {}
  override enterElseif_block_statement = (ctx: parser.Elseif_block_statementContext) => {}
  override enterElse_block_statement = (ctx: parser.Else_block_statementContext) => {}
  override enterEnd_if_statement = (ctx: parser.End_if_statementContext) => {}
  override enterOption_statement = (ctx: parser.Option_statementContext) => {}
  override enterAssignment_statement = (ctx: parser.Assignment_statementContext) => {}
  override enterCall_statement = (ctx: parser.Call_statementContext) => {}
  override enterError_statement = (ctx: parser.Error_statementContext) => {}
  override enterEvent_control_statement = (ctx: parser.Event_control_statementContext) => {}
  override enterCircle_statement = (ctx: parser.Circle_statementContext) => {}
  override enterClear_statement = (ctx: parser.Clear_statementContext) => {}
  override enterClose_statement = (ctx: parser.Close_statementContext) => {}
  override enterColor_statement = (ctx: parser.Color_statementContext) => {}
  override enterCommon_statement = (ctx: parser.Common_statementContext) => {}
  override enterData_statement = (ctx: parser.Data_statementContext) => {}
  override enterDef_seg_statement = (ctx: parser.Def_seg_statementContext) => {}
  override enterDim_statement = (ctx: parser.Dim_statementContext) => {}
  override enterDo_loop_statement = (ctx: parser.Do_loop_statementContext) => {}
  override enterEnd_statement = (ctx: parser.End_statementContext) => {}
  override enterField_statement = (ctx: parser.Field_statementContext) => {}

  override enterFor_next_statement = (ctx: parser.For_next_statementContext) => {
  }

  override exitFor_next_statement = (ctx: parser.For_next_statementContext) => {
  }

  override enterGet_graphics_statement = (ctx: parser.Get_graphics_statementContext) => {}
  override enterGet_io_statement = (ctx: parser.Get_io_statementContext) => {}
  override enterGosub_statement = (ctx: parser.Gosub_statementContext) => {}

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
  override enterReturn_statement = (ctx: parser.Return_statementContext) => {}
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
  override enterWhile_wend_statement = (ctx: parser.While_wend_statementContext) => {}
  override enterWidth_statement = (ctx: parser.Width_statementContext) => {}
  override enterWindow_statement = (ctx: parser.Window_statementContext) => {}
  override enterWrite_statement = (ctx: parser.Write_statementContext) => {}

  private checkNoExecutableStatements(ctx: ParserRuleContext) {
    for (const statement of this._chunk.statements) {
      if (statement.isExecutable()) {
        throw ParseError.fromToken(ctx.start!, "COMMON and DECLARE must precede executable statements");
      }
    }
  }

  override enterDeclare_statement = (ctx: parser.Declare_statementContext) => {
    this.checkNoExecutableStatements(ctx);
    // TODO: Check for mismatched declarations.
  }

  override enterExit_statement = (ctx: parser.Exit_statementContext) => {
    let returnFromProcedure = false;
    if (ctx.DEF()) {
      if (!hasParent(ctx, parser.Def_fn_statementContext)) {
        throw ParseError.fromToken(ctx.start!, "EXIT DEF not within DEF FN");
      }
      returnFromProcedure = true;
    } else if (ctx.DO()) {
      if (!hasParent(ctx, parser.Do_loop_statementContext)) {
       throw ParseError.fromToken(ctx.start!, "EXIT DO not within DO...LOOP");
      }
    } else if (ctx.FOR()) {
      if (!hasParent(ctx, parser.For_next_statementContext)) {
        throw ParseError.fromToken(ctx.start!, "EXIT FOR not within FOR...NEXT");
      }
    } else if (ctx.FUNCTION()) {
      if (!hasParent(ctx, parser.Function_statementContext)) {
        throw ParseError.fromToken(ctx.start!, "EXIT FUNCTION not within FUNCTION");
      }
      returnFromProcedure = true;
    } else if (ctx.SUB()) {
      if (!hasParent(ctx, parser.Sub_statementContext)) {
        throw ParseError.fromToken(ctx.start!, "EXIT SUB not within SUB");
      }
      returnFromProcedure = true;
    } else {
      throw new Error("invalid block type");
    }
    this.addStatement(statements.exit(returnFromProcedure));
    if (!returnFromProcedure) {
      this.addTarget(`_exit{}`, ctx);
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
    const name = getUntypedId(nameCtx!, /* allowPeriods= */ false);
    const elements: UserDefinedTypeElement[] = [];
    for (const elementCtx of ctx.type_element()) {
      const elementNameCtx = elementCtx.untyped_id() ?? elementCtx.untyped_fnid();
      const elementName = getUntypedId(elementNameCtx!, /* allowPeriods= */ false);
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
        symbols: this._chunk.symbols,
        expr: assignment.const_expr().expr(),
        constantExpression: true,
        ...(sigil ? {resultType: typeOfSigil(sigil)} : {}),
      });
      if (isError(value)) {
        throw ParseError.fromToken(assignment.ID().symbol, value.errorMessage);
      }
      this._chunk.symbols.defineConstant(name, value);
    }
  }

  private addStatement(statement: Statement) {
    this._chunk.statements.push(statement);
  }

  private addTarget(label: string, ctx: ParserRuleContext) {
    const currentStatementIndex = this._chunk.statements.length - 1;
    this._chunk.indexToTarget.set(currentStatementIndex, {label, token: ctx.start!});
  }

  private addLabel(label: string) {
    const nextStatementIndex = this._chunk.statements.length;
    this._chunk.labelToIndex.set(label, nextStatementIndex);
  }

  private parseParameterList(ctx: parser.Parameter_listContext | null): Variable[] {
    return ctx?.parameter().map((param) => this.parseParameter(param)) ?? [];
  }

  private parseDefFnParameterList(ctx: parser.Def_fn_parameter_listContext | null): Variable[] {
    return ctx?.def_fn_parameter().map((param) => this.parseParameter(param)) ?? [];
  }

  private parseParameter(ctx: parser.ParameterContext | parser.Def_fn_parameterContext): Variable {
    const nameCtx = ctx.untyped_id();
    const rawName = nameCtx ? getUntypedId(nameCtx) : ctx.ID()!.getText();
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
    return {type, name};
  }

  private getType(ctx: ParserRuleContext): Type {
    if (ctx.children.length != 1) {
      throw new Error('expecting exactly one child');
    }
    const child = ctx.children[0];
    if (child instanceof parser.Untyped_idContext || child instanceof parser.Untyped_fnidContext) {
      const typeName = getUntypedId(child, /* allowPeriods= */ false);
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
}

function firstCharOfId(name: string) {
  const lower = name.toLowerCase();
  return lower.startsWith('fn') ? name.slice(2, 1) : name.slice(0, 1);
}

function getUntypedId(ctx: parser.Untyped_idContext | parser.Untyped_fnidContext, allowPeriods: boolean = true): string {
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

function hasParent<T extends ParserRuleContext>(
  ctx: ParserRuleContext,
  constructor: RuleConstructor<T>): boolean {
  while (ctx.parent) {
    if (ctx.parent instanceof constructor) {
      return true;
    }
    ctx = ctx.parent;
  }
  return false;
}