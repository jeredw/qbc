import * as parser from "../build/QBasicParser.ts";
import { QBasicParserListener } from "../build/QBasicParserListener.ts";
import { ParseError } from "./Errors.ts";
import type { Program, ProgramChunk } from "./Programs.ts";
import { ParserRuleContext, ParseTreeWalker, TerminalNode, Token } from "antlr4ng";
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
import { SymbolTable, isProcedure, isVariable, isBuiltin } from "./SymbolTable.ts";
import { Procedure } from "./Procedures.ts";
import { isError, isNumeric, Value } from "./Values.ts";
import { parseLiteral, evaluateAsConstantExpression, compileExpression } from "./Expressions.ts";
import { StorageType } from "./Memory.ts";
import { StandardLibrary } from "./Builtins.ts";
import { getTyperContext } from "./ExtraParserContext.ts";

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
      debugInfo: {refs: []},
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

  override enterText_label = (ctx: parser.Text_labelContext) => {
    // Since it does not model most builtins, the grammar will parse cls : print
    // as a label cls followed by print.  Detect this and attach a builtin
    // symbol to ambiguous labels.
    const token = ctx.start!;
    let label = ctx.getText();
    if (label.endsWith(':')) {
      label = label.substring(0, label.length - 1);
    }
    label = label.toLowerCase();
    const builtin = this._builtins.lookup(label);
    if (!builtin) {
      return;
    }
    if (builtin.returnType?.tag === TypeTag.STRING) {
      // $ is part of the builtin name so a label like chr: is fine.
      return;
    }
    if (builtin.returnType || builtin.arguments.some((arg) => !arg.optional)) {
      throw ParseError.fromToken(token, "Expected: statement");
    }
    getTyperContext(ctx).$builtin = builtin;
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
    procedure.hasBody = true;
    this.installParameters(parameters);
  }

  private checkDeclaration(token: Token, declaration: Procedure, parameters: Variable[], returnType?: Type) {
    if (!!returnType !== !!declaration.result) {
      throw ParseError.fromToken(token, "Duplicate definition");
    }
    if (returnType && declaration.result && !sameType(declaration.result.type, returnType)) {
      throw ParseError.fromToken(token, "Duplicate definition");
    }
    if (parameters.length != declaration.parameters.length) {
      throw ParseError.fromToken(token, "Argument-count mismatch");
    }
    for (let i = 0; i < parameters.length; i++) {
      const declaredParam = declaration.parameters[i];
      const param = parameters[i];
      if (!sameType(declaredParam.type, param.type)) {
        throw ParseError.fromToken(declaredParam.token, "Parameter type mismatch");
      }
    }
  }

  override enterDeclare_function_statement = (ctx: parser.Declare_function_statementContext) => {
    const token = ctx.ID().symbol;
    const [name, sigil] = splitSigil(ctx.ID().getText().toLowerCase());
    const type = sigil ? typeOfSigil(sigil) : this.getDefaultType(name);
    const parameters = this.parseDeclareParameterList(ctx.declare_parameter_list());
    const declaration = this._chunk.symbols.lookupProcedure(name);
    if (declaration) {
      this.checkDeclaration(token, declaration, parameters, type);
      return;
    }
    this.installProcedure({name, type, token, parameters});
  }

  override enterFunction_statement = (ctx: parser.Function_statementContext) => {
    const token = ctx.ID().symbol;
    const [name, sigil] = splitSigil(ctx.ID().getText().toLowerCase());
    const type = sigil ? typeOfSigil(sigil) : this.getDefaultType(name);
    const parameters = this.parseParameterList(ctx.parameter_list());
    const declaration = this._chunk.symbols.lookupProcedure(name);
    if (declaration) {
      this.checkDeclaration(ctx.start!, declaration, parameters, type);
      declaration.parameters = parameters;
    }
    const procedure = declaration ?? this.installProcedure({name, parameters, type, token});
    getTyperContext(ctx).$procedure = procedure;
    this._storageType = ctx.STATIC() ? StorageType.STATIC : StorageType.AUTOMATIC;
    this._chunk = this._program.chunks[procedure.programChunkIndex];
    procedure.result!.address = this._chunk.symbols.allocate(StorageType.AUTOMATIC, 1);
    procedure.hasBody = true;
    this.installParameters(parameters);
  }

  override enterDeclare_sub_statement = (ctx: parser.Declare_sub_statementContext) => {
    const token = ctx.untyped_id().start!
    const name = getUntypedId(ctx.untyped_id(), {allowPeriods: true});
    const parameters = this.parseDeclareParameterList(ctx.declare_parameter_list());
    const declaration = this._chunk.symbols.lookupProcedure(name);
    if (declaration) {
      this.checkDeclaration(ctx.start!, declaration, parameters);
      return;
    }
    this.installProcedure({name, token, parameters});
  }

  override enterSub_statement = (ctx: parser.Sub_statementContext) => {
    const token = ctx.untyped_id().start!
    const name = getUntypedId(ctx.untyped_id(), {allowPeriods: true});
    const parameters = this.parseParameterList(ctx.parameter_list());
    const declaration = this._chunk.symbols.lookupProcedure(name);
    if (declaration) {
      this.checkDeclaration(ctx.start!, declaration, parameters);
      declaration.parameters = parameters;
    }
    const procedure = declaration ?? this.installProcedure({name, parameters, token});
    getTyperContext(ctx).$procedure = procedure;
    this._storageType = ctx.STATIC() ? StorageType.STATIC : StorageType.AUTOMATIC;
    this._chunk = this._program.chunks[procedure.programChunkIndex];
    procedure.hasBody = true;
    this.installParameters(parameters);
  }

  private installProcedure({name, parameters, type, token}: {name: string, parameters: Variable[], type?: Type, token: Token}): Procedure {
    const procedure: Procedure = {
      name,
      parameters,
      programChunkIndex: this._program.chunks.length,
      token,
    };
    if (type) {
      procedure.result = {name, type, token, storageType: StorageType.AUTOMATIC};
    }
    this._chunk.symbols.defineProcedure(procedure);
    const symbols = new SymbolTable({
      parent: this._chunk.symbols,
      builtins: this._builtins,
      name,
    });
    const chunk = this.makeProgramChunk(symbols, procedure);
    this._program.chunks.push(chunk);
    return procedure;
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
    const arrayName = ctx._name!.text!;
    const element = ctx._element?.text || '';
    const [name, sigil] = splitSigil(element ? `${arrayName}().${element}` : arrayName);
    const type = sigil ? typeOfSigil(sigil) : this.getDefaultType(name);
    const args = ctx.argument_list()?.argument() || [];
    const token = ctx._name!;
    const {symbol, newlyDefined} = this._chunk.symbols.lookupOrDefineVariable({
      name,
      type,
      sigil,
      numDimensions: args.length,
      token,
      storageType: this._storageType,
      isAsType: false,
      arrayBaseIndex: this._arrayBaseIndex,
    });
    getTyperContext(ctx).$symbol = symbol;
    this._program.debugInfo.refs.push({token, symbol});
    if (isBuiltin(symbol)) {
      if (!symbol.builtin.returnType) {
        throw ParseError.fromToken(ctx._name!, "Duplicate definition");
      }
      const returnType = symbol.builtin.returnType;
      let resultType = returnType;
      if (returnType.tag == TypeTag.NUMERIC || returnType.tag == TypeTag.FLOAT) {
        const args = ctx.argument_list()?.argument() || [];
        if (args.length == 0) {
          throw ParseError.fromToken(ctx._name!, "Argument-count mismatch");
        }
        const expr = args[0].expr();
        if (!expr) {
          throw new Error("unimplemented");
        }
        const {resultType: exprType} = compileExpression(expr, expr.start!, { tag: returnType.tag });
        resultType = exprType;
      }
      const result = this.makeSyntheticVariable(resultType, ctx._name!);
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
      const canonicalName = procedure.name.toLowerCase();
      if (canonicalName.startsWith('fn') && this._chunk.procedure?.name.toLowerCase() === canonicalName) {
        // def fns may not recurse.
        throw ParseError.fromToken(token, "Function not defined");
      }
      const result = this.makeSyntheticVariable(procedure.result!.type, ctx._name!);
      getTyperContext(ctx).$result = result;
      return;
    }
    if (isVariable(symbol)) {
      const variable = symbol.variable;
      if (variable.array) {
        if (newlyDefined && this._storageType === StorageType.AUTOMATIC) {
          // Implicitly defined arrays are not allowed in stack SUB/FUNCTION
          // procedures, because nothing will allocate the memory first.
          throw ParseError.fromToken(symbol.variable.token, "Array not defined");
        }
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
    const shared = !!ctx.SHARED();
    if (shared && this._chunk.procedure) {
      throw ParseError.fromToken(ctx.SHARED()!.symbol, "Illegal in procedure or DEF FN");
    }
    const redim = !!ctx.REDIM();
    for (const dim of ctx.dim_variable()) {
      const dimensions = this.getArrayBounds(dim.dim_array_bounds());
      if (redim && !dimensions.length) {
        throw ParseError.fromToken(dim.start!, "Expected: (");
      }
      const nonConstantBounds = dimensions.some((bound) => bound.lower === undefined || bound.upper === undefined);
      if (dimensions.length > 0) {
        this._optionBaseAllowed = false;
      }
      const dynamic = nonConstantBounds ||
        redim ||
        !this._useStaticArrays ||
        // All dimensioned arrays in non-STATIC procedures are dynamic.
        (!!this._chunk.procedure && this._storageType != StorageType.STATIC);
      const arrayDescriptor = {...dimensions.length ? {
        array: {dynamic, dimensions}
      } : {}};
      let existingVariable: Variable | undefined;
      let variable: Variable;
      if (!!dim.AS()) {
        const asType = this.getType(dim.type_name()!);
        const allowPeriods = asType.tag != TypeTag.RECORD;
        const name = getUntypedId(dim.untyped_id()!, {allowPeriods});
        const lookup = {name, sigil: '', array: dimensions.length > 0, type: asType};
        if (shared) {
          this.checkForConflictingLocalVariables(lookup);
        }
        existingVariable = this._chunk.symbols.lookupVariable(lookup);
        variable = {
          name,
          type: asType,
          isAsType: true,
          token: dim.untyped_id()!.start!,
          storageType: this._storageType,
          shared,
          ...arrayDescriptor,
        };
      } else {
        const [name, sigil] = splitSigil(dim.ID()?.getText()!);
        const asType = this._chunk.symbols.getAsType(name);
        const type = sigil ? typeOfSigil(sigil) :
          // So DIM x AS STRING, x(50) fails with "AS clause required".
          asType ? asType :
          this.getDefaultType(name);
        if (asType) {
          if (!sameType(type, asType)) {
            throw ParseError.fromToken(dim.ID()!.symbol, "Duplicate definition");
          }
          // DIM...AS followed by DIM without AS for the same name always fails.
          // But REDIM is allowed to drop AS.
          if (!redim) {
            throw ParseError.fromToken(dim.ID()!.symbol, "AS clause required");
          }
        }
        const lookup = {name, sigil, type, array: dimensions.length > 0};
        if (shared) {
          this.checkForConflictingLocalVariables(lookup);
        }
        existingVariable = this._chunk.symbols.lookupVariable(lookup);
        variable = {
          name,
          type,
          sigil,
          token: dim.ID()!.symbol,
          storageType: this._storageType,
          shared,
          ...arrayDescriptor,
        };
      }
      let treatAsDynamic = false;
      if (existingVariable && existingVariable.scopeDeclaration && !redim) {
        // A variable first encountered as a COMMON/SHARED declaration and later
        // a DIM would normally be a duplicate definition.  Upgrade the declared
        // symbol to a real one.
        if (!!dim.AS() && !existingVariable.isAsType) {
          throw ParseError.fromToken(existingVariable.token, "AS clause required");
        }
        if (!dim.AS() && existingVariable.isAsType) {
          throw ParseError.fromToken(dim.ID()!.symbol, "AS clause required");
        }
        if (!existingVariable.array && isSharedGlobal(existingVariable) && this._chunk.procedure) {
          // A new local variable aliasing a SHARED global is a duplicate definition.
          throw ParseError.fromToken(dim.ID()!.symbol, "Duplicate definition");
        }
        existingVariable.scopeDeclaration = false;
        if (variable.shared) {
          // COMMON followed by DIM SHARED should share a variable.
          existingVariable.shared = true;
        }
        if (existingVariable.array && arrayDescriptor.array) {
          // COMMON and SHARED don't have real array dimensions, so we need to
          // reallocate array variables...
          if (arrayDescriptor.array.dynamic) {
            existingVariable.array.dynamic = true;
          }
          treatAsDynamic = !!existingVariable.array.dynamic;
          existingVariable.array.dimensions = arrayDescriptor.array.dimensions;
          this._chunk.symbols.allocateArray(existingVariable);
        }
        variable = existingVariable;
      } else if (existingVariable && (redim || (existingVariable.array?.dynamic && variable.array))) {
        // Redim on an existing array doesn't need to install new symbols.
        // It is also valid to dim a dynamic array multiple times to reallocate it,
        // but the array must be explicitly erased in between.
        // redim is always treated as dynamic, even in $STATIC context.
        treatAsDynamic = true;
        if (!existingVariable.array) {
          throw new Error("redim of non-array");
        }
        if (!variable.array) {
          throw new Error("redim with non-array");
        }
        if (!redim && !dim.AS() && existingVariable.isAsType) {
          throw ParseError.fromToken(variable.token, "AS clause required");
        }
        if (!redim && dim.AS() && !existingVariable.isAsType) {
          throw ParseError.fromToken(variable.token, "AS clause required on first declaration");
        }
        if (redim && !sameType(existingVariable.type, variable.type)) {
          throw ParseError.fromToken(variable.token, "Duplicate definition");
        }
        // Can't check whether array arguments are dynamic at compile time.
        // For SHARED then REDIM before an actual DIM, we also don't yet know.
        // We'll detect this in code generation.
        if (!existingVariable.scopeDeclaration && !existingVariable.isParameter) {
          if (!existingVariable.array.dynamic) {
            throw ParseError.fromToken(variable.token, "Array already dimensioned");
          }
          if (existingVariable.array.dimensions.length != variable.array.dimensions.length) {
            throw ParseError.fromToken(variable.token, "Wrong number of dimensions");
          }
        }
        variable = existingVariable;
      } else {
        this._chunk.symbols.defineVariable(variable);
      }
      if (dimensions.length > 0 && (dynamic || treatAsDynamic)) {
        getTyperContext(dim).$result = variable;
      }
    }
  }

  private checkForConflictingLocalVariables({name, sigil, array, type}: {name: string, sigil: string, array: boolean, type: Type}) {
    for (let i = 1; i < this._program.chunks.length; i++) {
      const localVariable = this._program.chunks[i].symbols.lookupVariable({name, sigil, array, type});
      if (localVariable && !localVariable.isParameter && !isSharedGlobal(localVariable)) {
        throw ParseError.fromToken(localVariable.token, "Duplicate definition");
      }
    }
  }

  override enterErase_statement = (ctx: parser.Erase_statementContext) => {
    for (const arg of ctx.erase_argument()) {
      if (!arg._array) {
        throw new Error("missing array");
      }
      const array = this.lookupArray(arg._array);
      if (!array) {
        throw ParseError.fromToken(arg._array, "Array not defined");
      }
      getTyperContext(arg).$result = array;
    }
  }

  private getArrayBounds(ctx: parser.Dim_array_boundsContext | null): ArrayBounds[] {
    if (ctx == null) {
      return [];
    }
    const tryToEvaluateAsConstant = (expr: parser.ExprContext) => {
      let result: Value | undefined;
      try {
        this.lookupConstants(expr);
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

  override enterCommon_statement = (ctx: parser.Common_statementContext) => {
    if (this._chunk.procedure) {
      throw ParseError.fromToken(ctx.start!, "Illegal in procedure or DEF FN");
    }
    const shared = !!ctx.SHARED();
    for (const common of ctx.scope_variable()) {
      const numDimensions = common.array_declaration() ? 1 : 0;
      let variable: Variable;
      if (!!common.AS()) {
        const asType = this.getType(common.type_name()!);
        const allowPeriods = asType.tag != TypeTag.RECORD;
        const name = getUntypedId(common.untyped_id()!, {allowPeriods});
        const token = common.untyped_id()!.start!;
        if (shared) {
          this.checkForConflictingLocalVariables({name, sigil: '', array: numDimensions > 0, type: asType});
        }
        const {symbol} = this._chunk.symbols.lookupOrDefineVariable({
          name,
          type: asType,
          token,
          numDimensions,
          scopeDeclaration: true,
          storageType: StorageType.STATIC,
          isAsType: true,
          arrayBaseIndex: this._arrayBaseIndex,
          shared,
        });
        if (!isVariable(symbol)) {
          throw ParseError.fromToken(token, "Duplicate definition");
        }
        variable = symbol.variable;
      } else {
        const [name, sigil] = splitSigil(common.ID()?.getText()!);
        const asType = this._chunk.symbols.getAsType(name);
        const type = sigil ? typeOfSigil(sigil) :
          asType ? asType :
          this.getDefaultType(name);
        const token = common.ID()!.symbol;
        if (asType) {
          if (sameType(type, asType)) {
            throw ParseError.fromToken(token, "AS clause required");
          }
          throw ParseError.fromToken(token, "Duplicate definition");
        }
        if (shared) {
          this.checkForConflictingLocalVariables({name, sigil, type, array: numDimensions > 0});
        }
        const {symbol} = this._chunk.symbols.lookupOrDefineVariable({
          name,
          type,
          token,
          sigil,
          numDimensions,
          scopeDeclaration: true,
          storageType: StorageType.STATIC,
          isAsType: false,
          arrayBaseIndex: this._arrayBaseIndex,
          shared,
        });
        if (!isVariable(symbol)) {
          throw ParseError.fromToken(token, "Duplicate definition");
        }
        variable = symbol.variable;
      }
      if (variable.scopeDeclaration && variable.array) {
        // If we see common a() without a dim beforehand, assume a() is dynamic.
        variable.array.dynamic = true;
      }
      getTyperContext(common).$result = variable;
    }
  }

  override enterShared_statement = (ctx: parser.Shared_statementContext) => {
    if (!this._chunk.procedure || this._chunk.procedure.name.startsWith('fn')) {
      throw ParseError.fromToken(ctx.start!, "Illegal outside of SUB/FUNCTION");
    }
    // Lookup or install a placeholder symbol in the global symbol table.
    // DIM has special case handling to upgrade placeholder symbols later in
    // case there is a SHARED followed by DIM.
    const globalSymbols = this._program.chunks[0].symbols;
    for (const share of ctx.shared_variable()) {
      const numDimensions = share.array_declaration_no_dimensions() ? 1 : 0;
      if (!!share.AS()) {
        const asType = this.getType(share.type_name()!);
        const allowPeriods = asType.tag != TypeTag.RECORD;
        const name = getUntypedId(share.untyped_id()!, {allowPeriods});
        const token = share.untyped_id()!.start!;
        const existingVariable = this._chunk.symbols.lookupVariable({
          name, sigil: '', array: numDimensions > 0, type: asType
        });
        if (existingVariable && !isSharedGlobal(existingVariable)) {
          // Detect a SHARED declaration aliasing a local variable.
          throw ParseError.fromToken(token, "Duplicate definition");
        }
        const {symbol} = globalSymbols.lookupOrDefineVariable({
          name,
          type: asType,
          token,
          numDimensions,
          scopeDeclaration: true,
          storageType: StorageType.STATIC,
          isAsType: true,
          arrayBaseIndex: this._arrayBaseIndex,
        });
        if (!isVariable(symbol)) {
          throw ParseError.fromToken(token, "Duplicate definition");
        }
        this.shareVariable(symbol.variable, token);
      } else {
        const [name, sigil] = splitSigil(share.ID()?.getText()!);
        const asType = this._chunk.symbols.getAsType(name, /* assumeShared= */ true);
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
        const existingVariable = this._chunk.symbols.lookupVariable({
          name, sigil, type, array: numDimensions > 0,
        });
        if (existingVariable && !isSharedGlobal(existingVariable)) {
          // Detect a SHARED declaration aliasing a local variable.
          throw ParseError.fromToken(token, "Duplicate definition");
        }
        const {symbol} = globalSymbols.lookupOrDefineVariable({
          name,
          type,
          token,
          sigil,
          numDimensions,
          scopeDeclaration: true,
          storageType: StorageType.STATIC,
          isAsType: false,
          arrayBaseIndex: this._arrayBaseIndex,
        });
        if (!isVariable(symbol)) {
          throw ParseError.fromToken(token, "Duplicate definition");
        }
        this.shareVariable(symbol.variable, token);
      }
    }
  }

  private shareVariable(variable: Variable, token: Token) {
    if (!variable.sharedWith) {
      variable.sharedWith = new Set();
    }
    if (variable.sharedWith.has(this._chunk.procedure!.name)) {
      throw ParseError.fromToken(token, "Duplicate definition");
    }
    variable.sharedWith.add(this._chunk.procedure!.name);
    // Sharing a record variable also shares its elements.
    for (const element of variable.elements?.values() ?? []) {
      this.shareVariable(element, token);
    }
  }

  override enterStatic_statement = (ctx: parser.Static_statementContext) => {
    if (!this._chunk.procedure) {
      throw ParseError.fromToken(ctx.start!, "Illegal outside of SUB, FUNCTION or DEF FN");
    }
    for (const scope of ctx.scope_variable()) {
      let arrayDescriptor = {};
      if (scope.array_declaration()) {
        // Trying to define a STATIC array() creates a bogus empty array that
        // cannot be indexed at runtime.  It can only be dimensioned as a
        // dynamic array.
        arrayDescriptor = {
          array: {dimensions: [{lower: 0, upper: -1}], dynamic: true}
        };
      }
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
          static: true,
          scopeDeclaration: true,
          ...arrayDescriptor,
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
          static: true,
          scopeDeclaration: true,
          ...arrayDescriptor,
        });
      }
    }
  }

  private getForLoopCounter(id: TerminalNode): Variable {
    const token = id.symbol;
    const [name, sigil] = splitSigil(id.getText().toLowerCase());
    // This could actually be wrong, e.g. if we have DEFSTR I and DIM I AS INTEGER.
    // We'll look up the correct as type below.
    const type = sigil ? typeOfSigil(sigil) : this.getDefaultType(name);
    const {symbol} = this._chunk.symbols.lookupOrDefineVariable({
      name,
      type,
      sigil,
      numDimensions: 0,
      token,
      storageType: this._storageType,
      isAsType: false,
      arrayBaseIndex: this._arrayBaseIndex,
    });
    this._program.debugInfo.refs.push({token, symbol});
    if (isProcedure(symbol) && symbol.procedure.name == this._chunk.procedure?.name) {
      if (!symbol.procedure.result) {
        // e.g. SUB foo : foo = 42 : END SUB
        throw ParseError.fromToken(token, "Duplicate definition");
      }
      return symbol.procedure.result;
    }
    if (!isVariable(symbol)) {
      throw ParseError.fromToken(token, "Duplicate definition");
    }
    return symbol.variable;
  }

  override enterFor_next_statement = (ctx: parser.For_next_statementContext) => {
    const counter = this.getForLoopCounter(ctx.ID(0)!);
    getTyperContext(ctx).$result = counter;
    const nextId = ctx.ID(1);
    if (nextId) {
      const nextVariable = this.getForLoopCounter(nextId);
      if (nextVariable !== counter) {
        throw ParseError.fromToken(nextId.symbol, "NEXT without FOR");
      }
    }
    if (!isNumericType(counter.type)) {
      // Non-numeric counters cause a type mismatch on the end expression.
      throw ParseError.fromToken(ctx._end!.start!, "Type mismatch");
    }
    getTyperContext(ctx).$end = this.makeSyntheticVariable(counter.type, ctx._end!.start!);
    if (ctx._increment) {
      getTyperContext(ctx).$increment = this.makeSyntheticVariable(counter.type, ctx._increment!.start!);
    }
  }

  override enterRandomize_statement = (ctx: parser.Randomize_statementContext) => {
    if (!ctx.expr()) {
      getTyperContext(ctx).$result = this.makeSyntheticVariable({tag: TypeTag.INTEGER}, ctx.start!);
    }
  }

  override enterPalette_statement = (ctx: parser.Palette_statementContext) => {
    if (ctx._array) {
      const array = this.lookupArray(ctx._array);
      if (!array) {
        throw ParseError.fromToken(ctx._array, "Array not defined");
      }
      if (array.type.tag !== TypeTag.INTEGER && array.type.tag !== TypeTag.LONG) {
        throw ParseError.fromToken(ctx._array, "Type mismatch");
      }
      getTyperContext(ctx).$result = array;
    }
  }

  override enterGet_graphics_statement = (ctx: parser.Get_graphics_statementContext) => {
    if (ctx._array) {
      const array = this.lookupArray(ctx._array);
      if (!array) {
        throw ParseError.fromToken(ctx._array, "Array not defined");
      }
      getTyperContext(ctx).$result = array;
    }
  }

  override enterPut_graphics_statement = (ctx: parser.Put_graphics_statementContext) => {
    if (ctx._array) {
      const array = this.lookupArray(ctx._array);
      if (!array) {
        throw ParseError.fromToken(ctx._array, "Array not defined");
      }
      getTyperContext(ctx).$result = array;
    }
  }

  override exitSelect_case_statement = (ctx: parser.Select_case_statementContext) => {
    const {resultType} = compileExpression(ctx.expr(), ctx.expr().start!, { tag: TypeTag.PRINTABLE });
    getTyperContext(ctx).$test = this.makeSyntheticVariable(resultType, ctx.start!);
  }

  override enterCall_statement = (ctx: parser.Call_statementContext) => {
    const name = getUntypedId(ctx.untyped_id(), {allowPeriods: true});
    const builtin = this._chunk.symbols.lookupBuiltin(name, '', ctx.start!);
    if (builtin) {
      getTyperContext(ctx).$builtin = builtin;
      return;
    }
    const procedure = this._chunk.symbols.lookupProcedure(name);
    if (!procedure) {
      if (ctx.CALL()) {
        // When the CALL keyword is present, procedures don't need to be
        // declared first.  Try the lookup again in code generation after the
        // whole program has been checked.
        getTyperContext(ctx).$procedureName = name;
        return;
      }
      throw ParseError.fromToken(ctx.start!, "Subprogram not defined");
    }
    getTyperContext(ctx).$procedure = procedure;
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
    for (const assignment of ctx.const_assignment()) {
      const expr = assignment.const_expr().expr();
      this.lookupConstants(expr);
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

  private lookupConstants(expr: parser.ExprContext) {
    const typer = this;
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
  }

  override enterInclude_metacommand = (ctx: parser.Include_metacommandContext) => {
    throw ParseError.fromToken(ctx.start!, "Advanced feature unavailable")
  }

  override enterDate_function = (ctx: parser.Date_functionContext) => {
    const result = this.makeSyntheticVariable({tag: TypeTag.STRING}, ctx.start!);
    getTyperContext(ctx.parent!).$result = result;
  }

  override enterEnviron_string_function = (ctx: parser.Environ_string_functionContext) => {
    const result = this.makeSyntheticVariable({tag: TypeTag.STRING}, ctx.start!);
    getTyperContext(ctx.parent!).$result = result;
  }

  override enterErdev_function = (ctx: parser.Erdev_functionContext) => {
    const result = this.makeSyntheticVariable({tag: TypeTag.INTEGER}, ctx.start!);
    getTyperContext(ctx.parent!).$result = result;
  }

  override enterErdev_string_function = (ctx: parser.Erdev_string_functionContext) => {
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
    const result = this.makeSyntheticVariable({tag: TypeTag.INTEGER}, ctx.start!);
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

  override enterPlay_function = (ctx: parser.Play_functionContext) => {
    const result = this.makeSyntheticVariable({tag: TypeTag.INTEGER}, ctx.start!);
    getTyperContext(ctx.parent!).$result = result;
  }

  override enterScreen_function = (ctx: parser.Screen_functionContext) => {
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
    const result = this.makeSyntheticVariable({tag: TypeTag.SINGLE}, ctx.start!);
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

  override enterSadd_function = (ctx: parser.Sadd_functionContext) => {
    const result = this.makeSyntheticVariable({tag: TypeTag.INTEGER}, ctx.start!);
    getTyperContext(ctx.parent!).$result = result;
  }

  override enterVarptr_function = (ctx: parser.Varptr_functionContext) => {
    const result = this.makeSyntheticVariable({tag: TypeTag.INTEGER}, ctx.start!);
    getTyperContext(ctx.parent!).$result = result;
  }

  override enterVarptr_string_function = (ctx: parser.Varptr_string_functionContext) => {
    const result = this.makeSyntheticVariable({tag: TypeTag.STRING}, ctx.start!);
    getTyperContext(ctx.parent!).$result = result;
  }

  override enterVarseg_function = (ctx: parser.Varseg_functionContext) => {
    const result = this.makeSyntheticVariable({tag: TypeTag.INTEGER}, ctx.start!);
    getTyperContext(ctx.parent!).$result = result;
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

  private parseDeclareParameterList(ctx: parser.Declare_parameter_listContext | null): Variable[] {
    return ctx?.declare_parameter().map((param) => this.parseParameter(param)) ?? [];
  }

  private parseParameterList(ctx: parser.Parameter_listContext | null): Variable[] {
    return ctx?.parameter().map((param) => this.parseParameter(param)) ?? [];
  }

  private parseDefFnParameterList(ctx: parser.Def_fn_parameter_listContext | null): Variable[] {
    return ctx?.def_fn_parameter().map((param) => this.parseParameter(param)) ?? [];
  }

  private parseParameter(ctx: parser.ParameterContext | parser.Def_fn_parameterContext | parser.Declare_parameterContext): Variable {
    const nameCtx = ctx.untyped_id();
    const rawName = nameCtx ? getUntypedId(nameCtx, {allowPeriods: true}) : ctx.ID()!.getText();
    const [name, sigil] = splitSigil(rawName);
    const asTypeCtx = (
      ctx instanceof parser.ParameterContext ? ctx.type_name_for_parameter() :
      ctx instanceof parser.Declare_parameterContext ? ctx.type_name_for_declare_parameter() :
      ctx.type_name_for_def_fn_parameter()
    );
    const type: Type = sigil ? typeOfSigil(sigil) :
      asTypeCtx ? this.getType(asTypeCtx) :
      this.getDefaultType(name);
    const arrayDimensions = (
      (ctx instanceof parser.ParameterContext ||
       ctx instanceof parser.Declare_parameterContext) && ctx.array_declaration() ?
      {array: {dimensions: [{lower: undefined, upper: undefined}]}} :
      {}
    );
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
  return lower.startsWith('fn') ? lower.slice(2, 1) : lower.slice(0, 1);
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

function isSharedGlobal(variable: Variable): boolean {
  return variable.shared || (variable.sharedWith?.size ?? 0) > 0;
}