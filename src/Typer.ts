import * as parser from "../build/QBasicParser.ts";
import { QBasicParserListener } from "../build/QBasicParserListener.ts";
import { ParseError } from "./Errors.ts";
import type { Program, ProgramChunk } from "./Programs.ts";
import { ParserRuleContext, ParseTreeWalker, Token } from "antlr4ng";
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
import { SymbolTable, QBasicSymbol, isProcedure, isVariable, isBuiltin } from "./SymbolTable.ts";
import { Procedure } from "./Procedures.ts";
import { Constant, isError, isNumeric, typeOfValue, Value } from "./Values.ts";
import { typeCheckExpression, parseLiteral, evaluateAsConstantExpression } from "./Expressions.ts";
import { StorageType } from "./Memory.ts";
import { Builtin, StandardLibrary } from "./Builtins.ts";

export interface TyperContext {
  $symbol: QBasicSymbol;
  $procedure: Procedure;
  $builtin: Builtin;
  $constant: Constant;
  // Synthetic result variable for a function call, builtin, or array element
  // lookup lifted from an expression.
  $result: Variable;
  // Saved "TO" expression value for a for loop.
  $end: Variable;
  // Saved "STEP" expression value for a for loop.
  $increment: Variable;
  // Saved test expression for select case.
  $test: Variable;
}

export function getTyperContext(ctx: ParserRuleContext): TyperContext {
  return ctx as unknown as TyperContext;
}

export class Typer extends QBasicParserListener {
  private _firstCharToDefaultType: Map<string, Type> = new Map();
  private _chunk: ProgramChunk;
  private _program: Program;
  private _optionBaseAllowed = true;
  private _arrayBaseIndex = 0;
  private _syntheticVariableIndex = 0;
  private _storageType: StorageType = StorageType.STATIC;
  private _builtins: StandardLibrary;
  private _useStaticArrays = true;

  constructor(builtins: StandardLibrary) {
    super();
    this._builtins = builtins;
    const symbols = new SymbolTable({builtins: this._builtins});
    const topLevel = this.makeProgramChunk(symbols);
    this._chunk = topLevel;
    this._program = {
      chunks: [topLevel],
      types: new Map(),
      staticSize: 0,
      data: [],
    };
  }

  get program() {
    return this._program;
  }

  get arrayBaseIndex() {
    return this._arrayBaseIndex;
  }

  private makeProgramChunk(symbols: SymbolTable, procedure?: Procedure): ProgramChunk {
    return {statements: [], labelToIndex: new Map(), indexToTarget: [], symbols, procedure, stackSize: 0};
  }

  override exitProgram = (_ctx: parser.ProgramContext) => {
    this._program.staticSize = this._chunk.symbols.staticSize();
  }

  override enterFunction_statement = (ctx: parser.Function_statementContext) => {
    const token = ctx.ID().symbol;
    const [name, sigil] = splitSigil(ctx.ID().getText().toLowerCase());
    const parameters = this.parseParameterList(ctx.parameter_list());
    const procedure: Procedure = {
      name,
      parameters,
      result: {
        name,
        type: sigil ? typeOfSigil(sigil) : this.getDefaultType(name),
        token,
        storageType: StorageType.AUTOMATIC
      },
      programChunkIndex: this._program.chunks.length,
      token,
    };
    this._storageType = ctx.STATIC() ? StorageType.STATIC : StorageType.AUTOMATIC;
    this._chunk.symbols.defineProcedure(procedure);
    getTyperContext(ctx).$procedure = procedure;
    const symbols = new SymbolTable({
      parent: this._chunk.symbols,
      builtins: this._builtins,
      name,
    });
    this._chunk = this.makeProgramChunk(symbols, procedure);
    this._program.chunks.push(this._chunk);
    procedure.result!.address = this._chunk.symbols.allocate(StorageType.AUTOMATIC, 1);
    this.installParameters(parameters);
  }

  override enterDef_fn_statement = (ctx: parser.Def_fn_statementContext) => {
    const token = ctx._name!;
    const rawName = ctx._name!.text!.toLowerCase();
    // Correct "def fn foo" to "def fnfoo".
    const fnPrefixed = rawName.startsWith('fn') ? rawName : `fn${rawName}`;
    const [name, sigil] = splitSigil(fnPrefixed);
    const parameters = this.parseDefFnParameterList(ctx.def_fn_parameter_list());
    const procedure: Procedure = {
      name,
      parameters,
      result: {
        name,
        type: sigil ? typeOfSigil(sigil) : this.getDefaultType(name),
        token,
        storageType: StorageType.AUTOMATIC
      },
      programChunkIndex: this._program.chunks.length,
      token
    };
    this._storageType = StorageType.STATIC;
    this._chunk.symbols.defineFn(procedure);
    getTyperContext(ctx).$procedure = procedure;
    const symbols = new SymbolTable({
      parent: this._chunk.symbols,
      builtins: this._builtins,
      name,
    });
    this._chunk = this.makeProgramChunk(symbols, procedure);
    this._program.chunks.push(this._chunk);
    procedure.result!.address = this._chunk.symbols.allocate(StorageType.AUTOMATIC, 1);
    this.installParameters(parameters);
  }

  override enterSub_statement = (ctx: parser.Sub_statementContext) => {
    const name = getUntypedId(ctx.untyped_id(), {allowPeriods: true});
    const parameters = this.parseParameterList(ctx.parameter_list());
    const procedure = {
      name,
      parameters,
      programChunkIndex: this._program.chunks.length,
      token: ctx.untyped_id().start!
    };
    this._storageType = ctx.STATIC() ? StorageType.STATIC : StorageType.AUTOMATIC;
    this._chunk.symbols.defineProcedure(procedure);
    getTyperContext(ctx).$procedure = procedure;
    const symbols = new SymbolTable({
      parent: this._chunk.symbols,
      builtins: this._builtins,
      name,
    });
    this._chunk = this.makeProgramChunk(symbols, procedure);
    this._program.chunks.push(this._chunk);
    this.installParameters(parameters);
  }

  private installParameters(parameters: Variable[]) {
    for (const param of parameters) {
      this._chunk.symbols.defineVariable(param);
    }
  }

  private exitProcedure = (_ctx: ParserRuleContext) => {
    this._chunk.stackSize = this._chunk.symbols.stackSize();
    this._chunk = this._program.chunks[0];
    this._storageType = StorageType.STATIC;
  }

  override exitFunction_statement = this.exitProcedure;
  override exitDef_fn_statement = this.exitProcedure;
  override exitSub_statement = this.exitProcedure;

  override enterOption_statement = (ctx: parser.Option_statementContext) => {
    if (!this._optionBaseAllowed) {
      throw ParseError.fromToken(ctx.start!, "Array already dimensioned");
    }
    const base = ctx.DIGITS().getText();
    if (base == '0') {
      this._arrayBaseIndex = 0;
    } else if (base == '1') {
      this._arrayBaseIndex = 1;
    } else {
      throw ParseError.fromToken(ctx.DIGITS().symbol, "Expected 0 or 1");
    }
    this._optionBaseAllowed = false;
  }

  override exitVariable_or_function_call = (ctx: parser.Variable_or_function_callContext) => {
    const [name, sigil] = splitSigil(ctx._name!.text!);
    const type = sigil ? typeOfSigil(sigil) : this.getDefaultType(name);
    const args = ctx.argument_list()?.argument() || [];
    const element = ctx._element?.text || '';
    const symbol = this._chunk.symbols.lookupOrDefineVariable({
      name: element ? `${name}().${element}` : name,
      type,
      sigil,
      numDimensions: args.length,
      token: ctx._name!,
      storageType: this._storageType,
      isAsType: false,
      arrayBaseIndex: this._arrayBaseIndex,
    });
    getTyperContext(ctx).$symbol = symbol;
    if (isBuiltin(symbol)) {
      if (!symbol.builtin.returnType) {
        throw ParseError.fromToken(ctx._name!, "Duplicate definition");
      }
      // Assume that a polymorphic numeric return type has the type of the first argument.
      let returnType = symbol.builtin.returnType;
      if (returnType.tag == TypeTag.NUMERIC) {
        const args = ctx.argument_list()?.argument() || [];
        if (args.length == 0) {
          throw ParseError.fromToken(ctx._name!, "Argument-count mismatch");
        }
        const expr = args[0].expr();
        if (!expr) {
          throw new Error("unimplemented");
        }
        const value = typeCheckExpression({expr});
        if (isError(value) || !isNumeric(value)) {
          throw ParseError.fromToken(ctx._name!, "Type mismatch");
        }
        returnType = typeOfValue(value);
      }
      const result = this.makeSyntheticVariable(returnType, ctx._name!);
      getTyperContext(ctx).$result = result;
      return;
    }
    if (isProcedure(symbol) && !(ctx.parent instanceof parser.Assignment_statementContext)) {
      // If the direct parent is a LET, this is a function return assignment.
      // Otherwise, it is a function call that will be hoisted out into a
      // separate statement and assigned to a temporary result variable.
      const procedure = symbol.procedure;
      if (!procedure.result) {
        // Attempting to call a sub...
        throw ParseError.fromToken(ctx._name!, "Duplicate definition");
      }
      const result = this.makeSyntheticVariable(procedure.result!.type, ctx._name!);
      getTyperContext(ctx).$result = result;
      return;
    }
    if (isVariable(symbol)) {
      const variable = symbol.variable;
      if (variable.array) {
        this._optionBaseAllowed = false;
        // Note that for record arrays, result is a record with references to
        // each element at this index.  So t(2) creates _v0 = index(t, 2), but
        // also _v0.element = index(t().element, 2), etc.
        // TODO: Is this still necessary?
        const result = this.makeSyntheticVariable(variable.type, ctx._name!);
        getTyperContext(ctx).$result = result;
      }
      return;
    }
  }

  override enterArgument = (ctx: parser.ArgumentContext) => {
    // Look up arrays passed by reference and attach a symbol.  Other arguments
    // are looked up by Variable_or_function_call.
    if (ctx._array && ctx._array.text) {
      const result = this.lookupArray(ctx._array);
      if (!result) {
        throw ParseError.fromToken(ctx._array, "Array not defined");
      }
      getTyperContext(ctx).$result = result;
    }
    // Builtin array args for e.g. lbound, ubound would be parsed as variables,
    // and actually would get looked up as scalars, so those are handled with
    // special case parsing.
  }

  private makeSyntheticVariable(type: Type, token: Token): Variable {
    const name = `_v${this._syntheticVariableIndex++}`;
    const variable = {name, type, token, storageType: this._storageType};
    this._chunk.symbols.defineVariable(variable);
    return variable;
  }

  override enterError_statement = (ctx: parser.Error_statementContext) => {}
  override enterEvent_control_statement = (ctx: parser.Event_control_statementContext) => {}

  override enterData_statement = (ctx: parser.Data_statementContext) => {
    // Allow data anywhere to match qbasic /run.  This might break restore.
    // throw ParseError.fromToken(ctx.start!, "Illegal in procedure or DEF FN");
  }

  override enterStatic_metacommand = (ctx: parser.Static_metacommandContext) => {
    this._useStaticArrays = true;
  }

  override enterDynamic_metacommand = (ctx: parser.Dynamic_metacommandContext) => {
    this._useStaticArrays = false;
  }

  override enterDim_statement = (ctx: parser.Dim_statementContext) => {
    if (ctx.SHARED() && this._chunk.procedure) {
      throw ParseError.fromToken(ctx.SHARED()!.symbol, "Illegal in procedure or DEF FN");
    }
    for (const dim of ctx.dim_variable()) {
      const dimensions = this.getArrayBounds(dim.dim_array_bounds());
      const nonConstantBounds = dimensions.some((bound) => bound.lower === undefined || bound.upper === undefined);
      if (dimensions.length > 0) {
        this._optionBaseAllowed = false;
      }
      const dynamic = nonConstantBounds ||
        !this._useStaticArrays ||
        (!!this._chunk.procedure && this._storageType != StorageType.STATIC);
      // Dynamic arrays in static procedures parse but throw a runtime error.
      const inStaticProcedure =
        (!!this._chunk.procedure && this._storageType == StorageType.STATIC);
      const arrayDescriptor = {...dimensions.length ? {
        array: {dynamic, dimensions, inStaticProcedure}
      } : {}};
      let variable: Variable;
      if (!!dim.AS()) {
        const asType = this.getType(dim.type_name()!);
        const allowPeriods = asType.tag != TypeTag.RECORD;
        const name = getUntypedId(dim.untyped_id()!, {allowPeriods});
        variable = {
          name,
          type: asType,
          isAsType: true,
          token: dim.untyped_id()!.start!,
          storageType: this._storageType,
          shared: !!ctx.SHARED(),
          ...arrayDescriptor,
        };
        this._chunk.symbols.defineVariable(variable);
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
        variable = {
          name,
          type,
          sigil,
          token: dim.ID()!.symbol,
          storageType: this._storageType,
          shared: !!ctx.SHARED(),
          ...arrayDescriptor,
        };
        this._chunk.symbols.defineVariable(variable);
      }
      if (dimensions.length > 0 && dynamic) {
        getTyperContext(dim).$result = variable;
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
        result = evaluateAsConstantExpression({
          expr,
          resultType: { tag: TypeTag.INTEGER },
        });
      } catch (error: any) {
        // Thrown errors from evaluateAsConstantExpression() mean this is not a
        // constant expression.  This array bound must be dynamic, so swallow
        // the error and return undefined.
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
          this._arrayBaseIndex;
      const upper = tryToEvaluateAsConstant(range._upper!);
      if (lower !== undefined && upper !== undefined && upper < lower) {
        throw ParseError.fromToken(ctx.start!, "Subscript out of range");
      }
      return {lower, upper};
    });
  }

  override enterShared_statement = (ctx: parser.Shared_statementContext) => {
    if (!this._chunk.procedure || this._chunk.procedure.name.startsWith('fn')) {
      throw ParseError.fromToken(ctx.start!, "Illegal outside of SUB/FUNCTION");
    }
    // TODO: This doesn't work right for procedures that occur before global
    // definitions.
    const globalSymbols = this._program.chunks[0].symbols;
    for (const share of ctx.shared_variable()) {
      if (!!share.AS()) {
        const asType = this.getType(share.type_name()!);
        const allowPeriods = asType.tag != TypeTag.RECORD;
        const name = getUntypedId(share.untyped_id()!, {allowPeriods});
        const token = share.untyped_id()!.start!;
        const symbol = globalSymbols.lookupOrDefineVariable({
          name,
          type: asType,
          token,
          numDimensions: 0,  // TODO
          storageType: StorageType.STATIC,
          isAsType: true,
          arrayBaseIndex: this._arrayBaseIndex,
        });
        this.shareVariable(symbol, token);
      } else {
        const [name, sigil] = splitSigil(share.ID()?.getText()!);
        const asType = this._chunk.symbols.getAsType(name);
        const type = sigil ? typeOfSigil(sigil) :
          asType ? asType :
          this.getDefaultType(name);
        const token = share.ID()!.symbol;
        if (asType) {
          if (sameType(type, asType)) {
            throw ParseError.fromToken(token, "AS clause required");
          }
          throw ParseError.fromToken(token, "Duplicate definition");
        }
        const symbol = globalSymbols.lookupOrDefineVariable({
          name,
          type,
          token,
          sigil,
          numDimensions: 0,  // TODO
          storageType: StorageType.STATIC,
          isAsType: false,
          arrayBaseIndex: this._arrayBaseIndex,
        });
        this.shareVariable(symbol, token);
      }
    }
  }

  private shareVariable(symbol: QBasicSymbol, token: Token) {
    if (!isVariable(symbol)) {
      throw ParseError.fromToken(token, "Duplicate definition");
    }
    const variable = symbol.variable;
    if (!variable.sharedWith) {
      variable.sharedWith = new Set();
    }
    if (variable.sharedWith.has(this._chunk.procedure!.name)) {
      throw ParseError.fromToken(token, "Duplicate definition");
    }
    variable.sharedWith.add(this._chunk.procedure!.name);
  }

  override enterStatic_statement = (ctx: parser.Static_statementContext) => {
    if (!this._chunk.procedure) {
      throw ParseError.fromToken(ctx.start!, "Illegal outside of SUB, FUNCTION or DEF FN");
    }
    for (const scope of ctx.scope_variable()) {
      if (!!scope.AS()) {
        const asType = this.getType(scope.type_name()!);
        const allowPeriods = asType.tag != TypeTag.RECORD;
        const name = getUntypedId(scope.untyped_id()!, {allowPeriods});
        this._chunk.symbols.defineVariable({
          name,
          type: asType,
          isAsType: true,
          token: scope.untyped_id()!.start!,
          storageType: StorageType.STATIC,
        });
      } else {
        const [name, sigil] = splitSigil(scope.ID()?.getText()!);
        const asType = this._chunk.symbols.getAsType(name);
        const type = sigil ? typeOfSigil(sigil) :
          asType ? asType :
          this.getDefaultType(name);
        if (asType) {
          if (sameType(type, asType)) {
            throw ParseError.fromToken(scope.ID()!.symbol, "AS clause required");
          }
          throw ParseError.fromToken(scope.ID()!.symbol, "Duplicate definition");
        }
        this._chunk.symbols.defineVariable({
          name,
          sigil,
          type,
          token: scope.ID()!.symbol,
          storageType: StorageType.STATIC,
        });
      }
    }
  }

  override enterCommon_statement = (ctx: parser.Common_statementContext) => {}
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
      sigil,
      numDimensions: 0,
      token: ctx.ID(0)!.symbol,
      storageType: this._storageType,
      isAsType: false,
      arrayBaseIndex: this._arrayBaseIndex,
    });
    getTyperContext(ctx).$symbol = symbol;
    getTyperContext(ctx).$end = this.makeSyntheticVariable(type, ctx._end!.start!);
    if (ctx._increment) {
      getTyperContext(ctx).$increment = this.makeSyntheticVariable(type, ctx._increment!.start!);
    }
  }

  override enterGet_graphics_statement = (ctx: parser.Get_graphics_statementContext) => {}
  override enterGet_io_statement = (ctx: parser.Get_io_statementContext) => {}

  override enterIoctl_statement = (ctx: parser.Ioctl_statementContext) => {}
  override enterKey_statement = (ctx: parser.Key_statementContext) => {}
  override enterLocate_statement = (ctx: parser.Locate_statementContext) => {}
  override enterLock_statement = (ctx: parser.Lock_statementContext) => {}
  override enterLset_statement = (ctx: parser.Lset_statementContext) => {}
  override enterMid_statement = (ctx: parser.Mid_statementContext) => {}
  override enterOn_error_statement = (ctx: parser.On_error_statementContext) => {}
  override enterOn_event_gosub_statement = (ctx: parser.On_event_gosub_statementContext) => {}
  override enterOpen_legacy_statement = (ctx: parser.Open_legacy_statementContext) => {}
  override enterPaint_statement = (ctx: parser.Paint_statementContext) => {}
  override enterPalette_statement = (ctx: parser.Palette_statementContext) => {}
  override enterPlay_statement = (ctx: parser.Play_statementContext) => {}
  override enterPreset_statement = (ctx: parser.Preset_statementContext) => {}

  override enterPset_statement = (ctx: parser.Pset_statementContext) => {}
  override enterPut_graphics_statement = (ctx: parser.Put_graphics_statementContext) => {}
  override enterPut_io_statement = (ctx: parser.Put_io_statementContext) => {}
  override enterResume_statement = (ctx: parser.Resume_statementContext) => {}

  override enterRset_statement = (ctx: parser.Rset_statementContext) => {}
  override enterScreen_statement = (ctx: parser.Screen_statementContext) => {}

  override exitSelect_case_statement = (ctx: parser.Select_case_statementContext) => {
    const value = typeCheckExpression({expr: ctx.expr()});
    const type = typeOfValue(value);
    getTyperContext(ctx).$test = this.makeSyntheticVariable(type, ctx.start!);
  }

  override enterStop_statement = (ctx: parser.Stop_statementContext) => {}
  override enterUnlock_statement = (ctx: parser.Unlock_statementContext) => {}
  override enterView_statement = (ctx: parser.View_statementContext) => {}
  override enterView_print_statement = (ctx: parser.View_print_statementContext) => {}

  override enterWidth_statement = (ctx: parser.Width_statementContext) => {}
  override enterWindow_statement = (ctx: parser.Window_statementContext) => {}
  override enterWrite_statement = (ctx: parser.Write_statementContext) => {}

  override enterCall_statement = (ctx: parser.Call_statementContext) => {
    const name = getUntypedId(ctx.untyped_id(), {allowPeriods: true});
    const builtin = this._chunk.symbols.lookupBuiltin(name, '', ctx.start!);
    if (builtin) {
      getTyperContext(ctx).$builtin = builtin;
      return;
    }
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
    if (ctx.type_element().length == 0) {
      throw ParseError.fromToken(ctx.END().symbol, "Element not defined")
    }
    this._program.types.set(name, {tag: TypeTag.RECORD, name, elements});
  }

  override enterConst_statement = (ctx: parser.Const_statementContext) => {
    const typer = this;
    for (const assignment of ctx.const_assignment()) {
      const expr = assignment.const_expr().expr();
      ParseTreeWalker.DEFAULT.walk(new class extends QBasicParserListener {
        override exitVariable_or_function_call = (ctx: parser.Variable_or_function_callContext) => {
          const [name, sigil] = splitSigil(ctx._name!.text!);
          if (ctx.argument_list() || ctx._element) {
            throw ParseError.fromToken(ctx.start!, "Invalid constant");
          }
          const constant = typer._chunk.symbols.lookupConstant(name);
          if (!constant) {
            throw ParseError.fromToken(ctx.start!, "Invalid constant");
          }
          if (sigil && typeOfSigil(sigil).tag !== constant.value.tag) {
            throw ParseError.fromToken(ctx.start!, "Duplicate definition");
          }
          getTyperContext(ctx).$constant = constant;
        }
      }, expr);
      const [name, sigil] = splitSigil(assignment.ID().getText());
      const value = evaluateAsConstantExpression({
        expr: assignment.const_expr().expr(),
        ...(sigil ? {resultType: typeOfSigil(sigil)} : {}),
      });
      if (isError(value)) {
        throw ParseError.fromToken(assignment.ID().symbol, value.errorMessage);
      }
      this._chunk.symbols.defineConstant(name, {value, token: assignment.ID().symbol});
    }
  }

  override enterInclude_metacommand = (ctx: parser.Include_metacommandContext) => {
    throw ParseError.fromToken(ctx.start!, "Advanced feature unavailable")
  }

  override enterDate_function = (ctx: parser.Date_functionContext) => {
    const result = this.makeSyntheticVariable({tag: TypeTag.STRING}, ctx.start!);
    getTyperContext(ctx.parent!).$result = result;
  }

  override enterInput_function = (ctx: parser.Input_functionContext) => {
    const result = this.makeSyntheticVariable({tag: TypeTag.STRING}, ctx.start!);
    getTyperContext(ctx.parent!).$result = result;
  }

  override enterInstr_function = (ctx: parser.Instr_functionContext) => {
    const result = this.makeSyntheticVariable({tag: TypeTag.INTEGER}, ctx.start!);
    getTyperContext(ctx.parent!).$result = result;
  }

  override enterLen_function = (ctx: parser.Len_functionContext) => {
    const result = this.makeSyntheticVariable({tag: TypeTag.LONG}, ctx.start!);
    getTyperContext(ctx.parent!).$result = result;
  };

  override enterMid_function = (ctx: parser.Mid_functionContext) => {
    const result = this.makeSyntheticVariable({tag: TypeTag.STRING}, ctx.start!);
    getTyperContext(ctx.parent!).$result = result;
  }

  override enterPen_function = (ctx: parser.Pen_functionContext) => {
    const result = this.makeSyntheticVariable({tag: TypeTag.INTEGER}, ctx.start!);
    getTyperContext(ctx.parent!).$result = result;
  }

  override enterSeek_function = (ctx: parser.Seek_functionContext) => {
    const result = this.makeSyntheticVariable({tag: TypeTag.LONG}, ctx.start!);
    getTyperContext(ctx.parent!).$result = result;
  }

  override enterStrig_function = (ctx: parser.Strig_functionContext) => {
    const result = this.makeSyntheticVariable({tag: TypeTag.INTEGER}, ctx.start!);
    getTyperContext(ctx.parent!).$result = result;
  }

  override enterTime_function = (ctx: parser.Time_functionContext) => {
    const result = this.makeSyntheticVariable({tag: TypeTag.STRING}, ctx.start!);
    getTyperContext(ctx.parent!).$result = result;
  }

  override enterTimer_function = (ctx: parser.Timer_functionContext) => {
    const result = this.makeSyntheticVariable({tag: TypeTag.DOUBLE}, ctx.start!);
    getTyperContext(ctx.parent!).$result = result;
  }

  override enterLbound_function = (ctx: parser.Lbound_functionContext) => {
    const result = this.makeSyntheticVariable({tag: TypeTag.INTEGER}, ctx.start!);
    getTyperContext(ctx.parent!).$result = result;
    if (!ctx._array) {
      throw new Error("missing array");
    }
    const array = this.lookupArray(ctx._array);
    if (!array) {
      throw ParseError.fromToken(ctx._array, "Array not defined");
    }
    getTyperContext(ctx).$result = array;
  }

  override enterUbound_function = (ctx: parser.Ubound_functionContext) => {
    const result = this.makeSyntheticVariable({tag: TypeTag.INTEGER}, ctx.start!);
    getTyperContext(ctx.parent!).$result = result;
    if (!ctx._array) {
      throw new Error("missing array");
    }
    const array = this.lookupArray(ctx._array);
    if (!array) {
      throw ParseError.fromToken(ctx._array, "Array not defined");
    }
    getTyperContext(ctx).$result = array;
  }

  private lookupArray(token: Token): Variable {
    const [name, sigil] = splitSigil(token.text!);
    const type = sigil ? typeOfSigil(sigil) : this.getDefaultType(name);
    const result = this._chunk.symbols.lookupArray(name, sigil, type, token);
    if (!result) {
      throw ParseError.fromToken(token, "Array not defined");
    }
    return result;
  }

  private parseParameterList(ctx: parser.Parameter_listContext | null): Variable[] {
    return ctx?.parameter().map((param) => this.parseParameter(param)) ?? [];
  }

  private parseDefFnParameterList(ctx: parser.Def_fn_parameter_listContext | null): Variable[] {
    return ctx?.def_fn_parameter().map((param) => this.parseParameter(param)) ?? [];
  }

  private parseParameter(ctx: parser.ParameterContext | parser.Def_fn_parameterContext): Variable {
    const nameCtx = ctx.untyped_id();
    const rawName = nameCtx ? getUntypedId(nameCtx, {allowPeriods: true}) : ctx.ID()!.getText();
    const [name, sigil] = splitSigil(rawName);
    const asTypeCtx = ctx instanceof parser.ParameterContext ?
      ctx.type_name_for_parameter() :
      ctx.type_name_for_def_fn_parameter();
    const type: Type = sigil ? typeOfSigil(sigil) :
      asTypeCtx ? this.getType(asTypeCtx) :
      this.getDefaultType(name);
    const arrayDimensions = (ctx instanceof parser.ParameterContext && ctx.array_declaration()) ?
      {array: {dimensions: [{lower: undefined, upper: undefined}]}} : {};
    return {
      type,
      name,
      isAsType: !!asTypeCtx,
      isParameter: true,
      token: ctx.start!,
      storageType: StorageType.AUTOMATIC,
      ...arrayDimensions
    };
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
      if (fixedString._len) {
        const maxLength = parseLiteral(fixedString._len.text!);
        if (maxLength.tag != TypeTag.INTEGER) {
          throw ParseError.fromToken(fixedString._len, "Overflow");
        }
        if (maxLength.number == 0) {
          throw ParseError.fromToken(fixedString._len, "Illegal number");
        }
        return {tag: TypeTag.FIXED_STRING, maxLength: maxLength.number};
      }
      const id = fixedString.ID()!.getText();
      const [name, _] = splitSigil(id);
      const maxLength = this._chunk.symbols.lookupConstant(name);
      if (!maxLength || maxLength.value.tag != TypeTag.INTEGER || maxLength.value.number <= 0) {
        throw ParseError.fromToken(fixedString.ID()!.symbol, "Invalid constant");
      }
      return {tag: TypeTag.FIXED_STRING, maxLength: maxLength.value.number};
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