import * as parser from "../build/QBasicParser.ts";
import { QBasicParserListener } from "../build/QBasicParserListener";
import { ParseError } from "./Errors.ts";
import type { Program, ProgramChunk } from "./Programs";
import { ParserRuleContext } from "antlr4ng";
import {
  TypeTag,
  Type,
  UserDefinedTypeElement,
  splitSigil,
  typeOfDefType,
  typeOfName,
  typeOfSigil,
  sameType,
  isNumericType
} from "./Types.ts";
import { ArrayBounds, Variable } from "./Variables.ts";
import { SymbolTable, QBasicSymbol, isProcedure } from "./SymbolTable.ts";
import { Procedure } from "./Procedures.ts";
import { isError, isNumeric, Value } from "./Values.ts";
import { evaluateExpression } from "./Expressions.ts";

export interface TyperContext {
  $symbol: QBasicSymbol;
  $procedure: Procedure;
  // Synthetic result variable for a function call lifted from an expression.
  $result: Variable;
  // Saved "TO" expression value for a for loop.
  $end: Variable;
  // Saved "STEP" expression value for a for loop.
  $increment: Variable;
}

export function getTyperContext(ctx: ParserRuleContext): TyperContext {
  return ctx as unknown as TyperContext;
}

export class Typer extends QBasicParserListener {
  private _firstCharToDefaultType: Map<string, Type> = new Map();
  private _chunk: ProgramChunk;
  private _program: Program;
  private _arrayBaseIndex = 1;
  private _syntheticVariableIndex = 0;

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

  private makeProgramChunk(symbols: SymbolTable, procedure?: Procedure): ProgramChunk {
    return {statements: [], labelToIndex: new Map(), indexToTarget: new Map(), symbols, procedure};
  }

  override enterFunction_statement = (ctx: parser.Function_statementContext) => {
    const [name, sigil] = splitSigil(ctx.ID().getText().toLowerCase());
    const parameters = this.parseParameterList(ctx.parameter_list());
    const procedure = {
      name,
      parameters: parameters.map((ctxAndVariable) => ctxAndVariable[1]),
      result: {name, type: sigil ? typeOfSigil(sigil) : this.getDefaultType(name)},
      staticStorage: !!ctx.STATIC(),
      programChunkIndex: this._program.chunks.length,
    };
    try {
      this._chunk.symbols.defineProcedure(procedure);
    } catch (error: any) {
      throw ParseError.fromToken(ctx.ID().symbol, error.message);
    }
    getTyperContext(ctx).$procedure = procedure;
    this._chunk = this.makeProgramChunk(new SymbolTable(this._chunk.symbols), procedure);
    this._program.chunks.push(this._chunk);
    this.installParameters(parameters);
  }

  override enterDef_fn_statement = (ctx: parser.Def_fn_statementContext) => {
    const rawName = ctx._name!.text!.toLowerCase();
    // Correct "def fn foo" to "def fnfoo".
    const fnPrefixed = rawName.startsWith('fn') ? rawName : `fn${rawName}`;
    const [name, sigil] = splitSigil(fnPrefixed);
    const parameters = this.parseDefFnParameterList(ctx.def_fn_parameter_list());
    const procedure = {
      name,
      parameters: parameters.map((ctxAndVariable) => ctxAndVariable[1]),
      result: { name, type: sigil ? typeOfSigil(sigil) : this.getDefaultType(name) },
      programChunkIndex: this._program.chunks.length,
    };
    try {
      this._chunk.symbols.defineFn(procedure);
    } catch (error: any) {
      throw ParseError.fromToken(ctx._name!, error.message);
    }
    getTyperContext(ctx).$procedure = procedure;
    // TODO: only params and statics get local entries in a def fn
    this._chunk = this.makeProgramChunk(new SymbolTable(this._chunk.symbols));
    this._program.chunks.push(this._chunk);
    this.installParameters(parameters);
  }

  override enterSub_statement = (ctx: parser.Sub_statementContext) => {
    const name = getUntypedId(ctx.untyped_id(), {allowPeriods: true});
    const parameters = this.parseParameterList(ctx.parameter_list());
    const procedure = {
      name,
      parameters: parameters.map((ctxAndVariable) => ctxAndVariable[1]),
      staticStorage: !!ctx.STATIC(),
      programChunkIndex: this._program.chunks.length
    };
    try {
      this._chunk.symbols.defineProcedure(procedure);
    } catch (error: any) {
      throw ParseError.fromToken(ctx.untyped_id().start!, error.message);
    }
    getTyperContext(ctx).$procedure = procedure;
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

  override enterOption_statement = (ctx: parser.Option_statementContext) => {}

  override enterVariable_or_function_call = (ctx: parser.Variable_or_function_callContext) => {
    const [name, sigil] = splitSigil(ctx._name!.text!);
    const type = sigil ? typeOfSigil(sigil) : this.getDefaultType(name);
    try {
      const symbol = this._chunk.symbols.lookupOrDefineVariable({
        name,
        type,
        isDefaultType: !sigil,
        numDimensions: 0  // TODO arrays
      });
      getTyperContext(ctx).$symbol = symbol;
      if (!isProcedure(symbol) || ctx.parent instanceof parser.Assignment_statementContext) {
        return;
      }
      const procedure = symbol.procedure;
      const result = this.makeSyntheticVariable(procedure.result!.type);
      getTyperContext(ctx).$result = result;
    } catch (error: any) {
      throw ParseError.fromToken(ctx.start!, error.message);
    }
  }

  private makeSyntheticVariable(type: Type): Variable {
    const name = `_v${this._syntheticVariableIndex++}`;
    const variable = {name, type};
    this._chunk.symbols.defineVariable(variable);
    return variable;
  }

  override enterError_statement = (ctx: parser.Error_statementContext) => {}
  override enterEvent_control_statement = (ctx: parser.Event_control_statementContext) => {}
  override enterCommon_statement = (ctx: parser.Common_statementContext) => {}
  override enterData_statement = (ctx: parser.Data_statementContext) => {}

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

  override enterField_statement = (ctx: parser.Field_statementContext) => {}

  override enterFor_next_statement = (ctx: parser.For_next_statementContext) => {
    const [name, sigil] = splitSigil(ctx.ID(0)!.getText().toLowerCase());
    const type = sigil ? typeOfSigil(sigil) : this.getDefaultType(name);
    const nextId = ctx.ID(1);
    if (nextId) {
      // If present, the variable name and type in NEXT must match FOR.
      const [nextName, nextSigil] = splitSigil(nextId.getText().toLowerCase());
      const nextType = nextSigil ? typeOfSigil(nextSigil) : this.getDefaultType(nextName);
      if (name != nextName || !sameType(type, nextType)) {
        throw ParseError.fromToken(ctx.ID(1)!.symbol, "NEXT without FOR");
      }
    }
    if (!isNumericType(type)) {
      // Non-numeric counters cause a type mismatch on the end expression.
      throw ParseError.fromToken(ctx._end!.start!, "Type mismatch");
    }
    const symbol = this._chunk.symbols.lookupOrDefineVariable({
      name,
      type,
      isDefaultType: !sigil,
      numDimensions: 0
    });
    getTyperContext(ctx).$symbol = symbol;
    getTyperContext(ctx).$end = this.makeSyntheticVariable(type);
    getTyperContext(ctx).$increment = this.makeSyntheticVariable(type);
  }

  override enterGet_graphics_statement = (ctx: parser.Get_graphics_statementContext) => {}
  override enterGet_io_statement = (ctx: parser.Get_io_statementContext) => {}

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

  override enterPrint_using_statement = (ctx: parser.Print_using_statementContext) => {}
  override enterPset_statement = (ctx: parser.Pset_statementContext) => {}
  override enterPut_graphics_statement = (ctx: parser.Put_graphics_statementContext) => {}
  override enterPut_io_statement = (ctx: parser.Put_io_statementContext) => {}
  override enterRead_statement = (ctx: parser.Read_statementContext) => {}
  override enterRem_statement = (ctx: parser.Rem_statementContext) => {}
  override enterResume_statement = (ctx: parser.Resume_statementContext) => {}

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

  override enterWidth_statement = (ctx: parser.Width_statementContext) => {}
  override enterWindow_statement = (ctx: parser.Window_statementContext) => {}
  override enterWrite_statement = (ctx: parser.Write_statementContext) => {}

  override enterCall_statement = (ctx: parser.Call_statementContext) => {
    const name = getUntypedId(ctx.untyped_id(), {allowPeriods: true});
    const procedure = this._chunk.symbols.lookupProcedure(name);
    if (!procedure) {
      throw ParseError.fromToken(ctx.start!, "Subprogram not defined");
    }
    getTyperContext(ctx).$procedure = procedure;
  }

  override enterDeclare_statement = (ctx: parser.Declare_statementContext) => {
    // TODO: Check for mismatched declarations.
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
    return [ctx, {type, name, isAsType: !!asTypeCtx, isParameter: true}];
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
}

function firstCharOfId(name: string) {
  const lower = name.toLowerCase();
  return lower.startsWith('fn') ? name.slice(2, 1) : name.slice(0, 1);
}

function getUntypedId(ctx: parser.Untyped_idContext | parser.Untyped_fnidContext, {allowPeriods}: {allowPeriods: boolean}): string {
  const id = ctx.getText();
  const [_, sigil] = splitSigil(id);
  if (sigil) {
    throw ParseError.fromToken(ctx.start!, "Identifier cannot end with %, &, !, # or $");
  }
  if (!allowPeriods && id.includes('.')) {
      throw ParseError.fromToken(ctx.start!, "Identifier cannot include period");
  }
  return id.toLowerCase();
}