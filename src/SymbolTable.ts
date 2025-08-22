import { Token } from "antlr4ng";
import { Procedure } from "./Procedures.ts";
import { isNumericType, sameType, Type, TypeTag } from "./Types.ts";
import { Constant } from "./Values.ts";
import { getElementSizeInBytes, getScalarValueCount, getValueCount, Variable } from "./Variables.ts";
import { ParseError } from "./Errors.ts";
import { Address, StorageType } from "./Memory.ts";
import { Builtin, StandardLibrary } from "./Builtins.ts";

// Variables, constants (CONST), and procedures (FUNCTION and SUB) share the
// same namespace.  Constants and procedures are looked up only by name, not by
// type or number of arguments.
//
// Variables of different types can have the same name, and a scalar ("simple")
// variable can have the same name as an array variable.
//
// Names can have at most one AS type.
//
//   DIM x AS STRING, x(5) AS STRING  ' ok
//   DIM x AS STRING, x(5) AS INTEGER ' Duplicate definition
//
// After DIM...AS, typed references to a name, whether array or scalar, must
// agree with the AS type.  But e.g. untyped array references ignore the AS type
// for scalar variables with the same name.
// 
//   DIM x AS STRING
//   x = 42       ' Type mismatch
//   x! = 42      ' Duplicate definition
//   x(5) = 42    ' ok
//   x$(5) = "ok" ' ok
//   x!(5) = 42   ' Duplicate definition

export enum QBasicSymbolTag {
  PROCEDURE,
  CONSTANT,
  VARIABLE,
  BUILTIN,
}

export interface ProcedureSymbol {
  tag: QBasicSymbolTag.PROCEDURE;
  procedure: Procedure;
}

export interface ConstantSymbol {
  tag: QBasicSymbolTag.CONSTANT;
  constant: Constant;
}

export interface VariableSymbol {
  tag: QBasicSymbolTag.VARIABLE;
  variable: Variable;
}

export interface BuiltinSymbol {
  tag: QBasicSymbolTag.BUILTIN;
  builtin: Builtin;
}

export type QBasicSymbol =
  | ProcedureSymbol
  | ConstantSymbol
  | VariableSymbol
  | BuiltinSymbol;

export function isVariable(symbol: QBasicSymbol): symbol is VariableSymbol {
  return 'variable' in symbol;
}

export function isConstant(symbol: QBasicSymbol): symbol is ConstantSymbol {
  return 'constant' in symbol;
}

export function isProcedure(symbol: QBasicSymbol): symbol is ProcedureSymbol {
  return 'procedure' in symbol;
}

export function isBuiltin(symbol: QBasicSymbol): symbol is BuiltinSymbol {
  return 'builtin' in symbol;
}

type TypeToItemMap<T> = Map<TypeTag, T>

// Slot contains all the symbols associated with a name in a particular symbol table.
interface Slot {
  procedure?: Procedure;
  constant?: Constant;
  defFns?: TypeToItemMap<Procedure>;
  scalarVariables?: TypeToItemMap<Variable>;
  arrayVariables?: TypeToItemMap<Variable>;
  scalarAsType?: Type;
  arrayAsType?: Type;
}

// NameToSlotMap records all the name to symbol mappings for a symbol table.
class NameToSlotMap {
  private _map: Map<string, Slot> = new Map();
  // Installed in the global table to track local names, so that we can detect
  // conflicts from procedures defined later in the program.
  private _someLocalVariable: Map<string, Variable> = new Map();
  private _someLocalArrayVariable: Map<string, Variable> = new Map();
  private _someParameter: Map<string, Variable> = new Map();
  // Installed in the global table to detect and error on symbols that might be
  // ambiguous with record elements.
  private _recordVariableNames: Set<String> = new Set();
  private _possibleConflictsWithRecordNames: Map<String, Token> = new Map();

  get(name: string): Slot | undefined {
    return this._map.get(canonicalName(name));
  }

  variables(): Variable[] {
    const scalars = Array.from(this._map.values())
      .filter((slot) => !!slot.scalarVariables)
      .flatMap((slot) => Array.from(slot.scalarVariables!.values()));
    const arrays = Array.from(this._map.values())
      .filter((slot) => !!slot.arrayVariables)
      .flatMap((slot) => Array.from(slot.arrayVariables!.values()));
    return scalars.concat(arrays);
  }

  set(name: string, slot: Slot) {
    this._map.set(canonicalName(name), slot);
  }

  addRecordVariableName(name: string) {
    name = canonicalName(name);
    this._recordVariableNames.add(name);
  }

  conflictsWithRecordVariable(name: string): boolean {
    name = canonicalName(name);
    const prefix = textBeforeFirstPeriod(name);
    return prefix ? this._recordVariableNames.has(prefix) : false;
  }

  addPossibleRecordNameConflict(name: string, token: Token) {
    name = canonicalName(name);
    const prefix = textBeforeFirstPeriod(name);
    if (prefix) {
      this._possibleConflictsWithRecordNames.set(prefix, token);
    }
  }

  getSomeTokenConflictingWithRecordVariableName(name: string): Token | undefined {
    name = canonicalName(name);
    return this._possibleConflictsWithRecordNames.get(name);
  }

  has(name: string) {
    return this._map.has(canonicalName(name));
  }

  setLocalVariable(variable: Variable) {
    this._someLocalVariable.set(canonicalName(variable.name), variable);
  }

  setLocalArrayVariable(variable: Variable) {
    this._someLocalArrayVariable.set(canonicalName(variable.name), variable);
  }

  getSomeLocalVariable(name: string) {
    return this._someLocalVariable.get(canonicalName(name));
  }

  getSomeLocalArrayVariable(name: string) {
    return this._someLocalArrayVariable.get(canonicalName(name));
  }

  setParameter(variable: Variable) {
    this._someParameter.set(canonicalName(variable.name), variable);
  }

  getParameter(name: string) {
    return this._someParameter.get(canonicalName(name));
  }
}

function canonicalName(name: string): string {
  return name.toLowerCase();
}

function textBeforeFirstPeriod(name: string): string | undefined {
  if (!name.includes('.')) {
    return;
  }
  const [prefix] = name.split('.');
  return prefix;
}

export class SymbolTable {
  private _builtins: StandardLibrary;
  private _parent: SymbolTable | undefined;
  private _name?: string;
  private _symbols: NameToSlotMap = new NameToSlotMap();
  private _stackIndex: number;
  private _staticIndex: number;
  private _record: Variable;
  private _elementOffset: number;
  private _elementByteOffset: number;
  static _symbolIndex = 0x0100;
  
  constructor({builtins, parent, name} : {builtins: StandardLibrary, parent?: SymbolTable, name?: string}) {
    this._builtins = builtins;
    this._parent = parent;
    this._name = name;
    this._stackIndex = 0;
    this._staticIndex = 0;
  }

  lookupConstant(name: string): Constant | undefined {
    return this._symbols.get(name)?.constant ?? this._parent?.lookupConstant(name);
  }

  lookupProcedure(name: string): Procedure | undefined {
    return this._symbols.get(name)?.procedure ?? this._parent?.lookupProcedure(name);
  }

  lookupBuiltin(name: string, sigil: string | undefined, token: Token): Builtin | undefined {
    const builtin = this._builtins.lookup(name);
    if (builtin) {
      if (!builtin.returnType || isNumericType(builtin.returnType)) {
        if (!sigil) {
          return builtin;
        }
        if (sigil != '$') {
          // cls% isn't a valid identifier, but cls$ is.
          throw ParseError.fromToken(token, "Duplicate definition");
        }
      }
      if (builtin.returnType && builtin.returnType.tag == TypeTag.STRING) {
        // chr% can shadow chr$.
        return sigil === '$' ? builtin : undefined;
      }
    }
  }

  lookupArray(name: string, sigil: string | undefined, type: Type, token: Token): Variable | undefined {
    const isDefaultType = !sigil;
    const lookup = (slot?: Slot, sameScope?: boolean): Variable | undefined => {
      if (!slot) {
        return;
      }
      if (slot.arrayVariables) {
        const asType = slot.arrayAsType ?? slot.scalarAsType;
        const lookupType = getLookupType({type, asType, isDefaultType});
        if (!asType || sameType(asType, lookupType)) {
          const variable = slot.arrayVariables.get(lookupType.tag);
          if (variable && (sameScope || this.isVisible(variable))) {
            return variable;
          }
        }
        throw ParseError.fromToken(token, "Duplicate definition");
      }
    };
    return (
      lookup(this._symbols.get(name), true) ??
      lookup(this._parent?._symbols.get(name))
    );
  }

  lookupVariable({name, sigil, array, type} : {name: string, sigil: string, array: boolean, type: Type}): Variable | undefined {
    const isDefaultType = !sigil;
    const lookup = (slot?: Slot, sameScope?: boolean): Variable | undefined => {
      if (!slot) {
        return;
      }
      if (!array && slot.scalarVariables) {
        const asType = slot.scalarAsType ?? slot.arrayAsType;
        const lookupType = getLookupType({type, asType, isDefaultType});
        if (!asType || sameType(asType, lookupType)) {
          const variable = slot.scalarVariables.get(lookupType.tag);
          if (variable && (sameScope || this.isVisible(variable))) {
            return variable;
          }
        }
      }
      if (array && slot.arrayVariables) {
        const asType = slot.arrayAsType ?? slot.scalarAsType;
        if (asType && isDefaultType) {
          type = asType;
        }
        if (!asType || sameType(asType, type)) {
          const variable = slot.arrayVariables.get(type.tag);
          if (variable && (sameScope || this.isVisible(variable))) {
            if (!variable.array) {
              throw new Error("missing array dimensions");
            }
            return variable;
          }
        }
      }
    };
    return (
      lookup(this._symbols.get(name), true) ??
      lookup(this._parent?._symbols.get(name))
    );
  }

  // Look up a name, and if it is not found, define a new variable with that
  // name and the given type.
  lookupOrDefineVariable({name, type, sigil, numDimensions, scopeDeclaration, token, storageType, isAsType, arrayBaseIndex, shared}: {
      name: string,
      type: Type,
      sigil?: string,
      numDimensions: number,
      scopeDeclaration?: boolean,
      token: Token,
      storageType: StorageType,
      isAsType: boolean,
      arrayBaseIndex: number,
      shared?: boolean,
    }): {symbol: QBasicSymbol, newlyDefined?: boolean} {
    const builtin = this.lookupBuiltin(name, sigil, token);
    if (builtin) {
      return {symbol: {tag: QBasicSymbolTag.BUILTIN, builtin}};
    }
    const isDefaultType = !sigil;
    const lookup = (slot?: Slot, sameScope?: boolean): QBasicSymbol | undefined => {
      if (!slot) {
        return;
      }
      if (slot.procedure) {
        if (!slot.procedure.result || !sigil || sameType(type, slot.procedure.result.type)) {
          return {tag: QBasicSymbolTag.PROCEDURE, procedure: slot.procedure};
        }
        throw ParseError.fromToken(token, "Duplicate definition");
      }
      if (slot.defFns) {
        const procedure = slot.defFns.get(type.tag);
        if (procedure) {
          return {tag: QBasicSymbolTag.PROCEDURE, procedure};
        }
        throw ParseError.fromToken(token, "Duplicate definition");
      }
      if (slot.constant) {
        if (isDefaultType || slot.constant.value.tag == type.tag) {
          return {tag: QBasicSymbolTag.CONSTANT, constant: slot.constant};
        }
        throw ParseError.fromToken(token, "Duplicate definition");
      }
      if (numDimensions == 0 && slot.scalarVariables) {
        const asType = slot.scalarAsType;
        const lookupType = getLookupType({type, isDefaultType, asType});
        if (!asType || sameType(asType, lookupType)) {
          const variable = slot.scalarVariables.get(lookupType.tag);
          if (variable && (sameScope || this.isVisible(variable))) {
            return {tag: QBasicSymbolTag.VARIABLE, variable};
          }
        }
      }
      if (numDimensions > 0 && slot.arrayVariables) {
        const asType = slot.arrayAsType;
        const lookupType = getLookupType({type, isDefaultType, asType});
        if (!asType || sameType(asType, lookupType)) {
          const variable = slot.arrayVariables.get(lookupType.tag);
          if (variable && (sameScope || this.isVisible(variable))) {
            if (!variable.array) {
              throw new Error("missing array dimensions");
            }
            if (!scopeDeclaration && !variable.scopeDeclaration && !variable.isParameter &&
                variable.array.dimensions.length != numDimensions) {
              throw ParseError.fromToken(token, "Wrong number of dimensions");
            }
            return {tag: QBasicSymbolTag.VARIABLE, variable};
          }
        }
      }
    };
    const existingSymbol = (
      lookup(this._symbols.get(name), true) ??
      lookup(this._parent?._symbols.get(name))
    );
    if (existingSymbol) {
      return {symbol: existingSymbol};
    }
    const array = numDimensions > 0 ? {
      array: {
        dimensions: new Array(numDimensions).fill({
          lower: arrayBaseIndex, upper: 10
        })
      },
    } : {};
    if (storageType === StorageType.AUTOMATIC && numDimensions > 0) {
      // Arrays cannot be implicitly defined on the stack.
      throw ParseError.fromToken(token, "Array not defined");
    }
    const variable = { name, type, sigil, token, storageType, isAsType, scopeDeclaration, shared, ...array };
    this.defineVariable(variable);
    return {
      symbol: {tag: QBasicSymbolTag.VARIABLE, variable},
      newlyDefined: true
    };
  }

  getAsType(name: string, assumeShared?: boolean): Type | undefined {
    const slot = this._symbols.get(name);
    const asType = slot?.scalarAsType ?? slot?.arrayAsType;
    if (asType) {
      return asType;
    }
    const parentSlot = this._parent?._symbols.get(name);
    if (parentSlot?.scalarAsType) {
      const variable = parentSlot?.scalarVariables?.get(parentSlot?.scalarAsType.tag);
      if (variable && (assumeShared || this.isVisible(variable))) {
        return parentSlot?.scalarAsType;
      }
    }
    if (parentSlot?.arrayAsType) {
      const variable = parentSlot?.arrayVariables?.get(parentSlot?.arrayAsType.tag);
      if (variable && (assumeShared || this.isVisible(variable))) {
        return parentSlot?.arrayAsType;
      }
    }
  }

  variables(): Variable[] {
    return this._symbols.variables();
  }

  defineVariable(variable: Variable, element?: boolean) {
    const builtin = this.lookupBuiltin(variable.name, variable.sigil, variable.token);
    if (builtin) {
      throw ParseError.fromToken(variable.token, "Duplicate definition");
    }
    const mySlot = this._symbols.get(variable.name) ?? {};
    const parentSlot = this._parent?._symbols.get(variable.name) ?? {};
    if (variable.name.toLowerCase().startsWith('fn')) {
      throw ParseError.fromToken(variable.token, "Duplicate definition");
    }
    if (mySlot.procedure || parentSlot.procedure) {
      throw ParseError.fromToken(variable.token, "Duplicate definition");
    }
    if (!variable.isParameter && !variable.array && (mySlot.constant || parentSlot.constant)) {
      throw ParseError.fromToken(variable.token, "Duplicate definition");
    }
    if (mySlot.defFns || parentSlot.defFns) {
      throw ParseError.fromToken(variable.token, "Cannot start with FN");
    }
    const table = this.defFn() && !variable.static && !variable.isParameter ?
      this._parent!._symbols :
      this._symbols;
    const slot = table.get(variable.name) ?? {};
    // Try to give nice error messages for typo'd element names first.
    this.checkForInvalidRecordElement(variable);
    if (variable.type.tag !== TypeTag.RECORD && !element) {
      this.checkForConflictingRecordVariables(variable.name, variable.token);
    }
    if (!variable.array) {
      const global = parentSlot.scalarVariables?.get(variable.type.tag);
      if (global && !variable.isParameter && this.isVisible(global)) {
        throw ParseError.fromToken(variable.token, "Duplicate definition");
      }
      const asType = slot.scalarAsType ?? slot.arrayAsType;
      if (asType && (variable.isAsType || variable.sigil) && !sameType(asType, variable.type)) {
        // dim x as string
        // dim x as integer
        throw ParseError.fromToken(variable.token, "Duplicate definition");
      }
      if (variable.isAsType) {
        slot.scalarAsType = variable.type;
      }
      if (!slot.scalarVariables) {
        slot.scalarVariables = new Map();
      } else if (variable.isAsType) {
        // x = 42
        // dim x as string
        throw ParseError.fromToken(variable.token, "Duplicate definition");
      }
      if (slot.scalarVariables.has(variable.type.tag)) {
        // x$ = "foo"
        // dim x$
        throw ParseError.fromToken(variable.token, "Duplicate definition");
      }
      slot.scalarVariables.set(variable.type.tag, variable);
      if (!element) {
        // Parameters are passed by reference so only consume one stack slot.
        const size = variable.isParameter ? 1 : getValueCount(variable);
        variable.address = this.allocate(variable.storageType, size);
      }
      variable.symbolIndex = SymbolTable._symbolIndex++;
    } else {
      const global = parentSlot.arrayVariables?.get(variable.type.tag);
      if (global && !variable.isParameter && this.isVisible(global)) {
        throw ParseError.fromToken(variable.token, "Duplicate definition");
      }
      const asType = slot.arrayAsType ?? slot.scalarAsType;
      if (asType && (variable.isAsType || variable.sigil) && !sameType(asType, variable.type)) {
        throw ParseError.fromToken(variable.token, "Duplicate definition");
      }
      if (variable.isAsType) {
        slot.arrayAsType = variable.type;
      }
      if (!slot.arrayVariables) {
        slot.arrayVariables = new Map();
      } else if (variable.isAsType) {
        throw ParseError.fromToken(variable.token, "Duplicate definition");
      }
      if (slot.arrayVariables.has(variable.type.tag)) {
        throw ParseError.fromToken(variable.token, "Array already dimensioned");
      }
      slot.arrayVariables.set(variable.type.tag, variable);
      if (!variable.array.valuesPerItem) {
        variable.array.valuesPerItem = getScalarValueCount(variable);
      }
      if (!element) {
        this.allocateArray(variable);
      }
      variable.symbolIndex = SymbolTable._symbolIndex++;
    }
    if (variable.type.tag == TypeTag.RECORD) {
      const globalTable = this._parent?._symbols ?? this._symbols;
      const conflict = globalTable.getSomeTokenConflictingWithRecordVariableName(variable.name);
      if (conflict) {
        throw ParseError.fromToken(conflict, "Identifier cannot include period");
      }
      globalTable.addRecordVariableName(variable.name);
      variable.elements = new Map();
      if (!element) {
        // The outermost record in a nested record type has the storage
        // allocation, and element offsets are relative to that.
        this._record = variable;
        this._elementOffset = 0;
        this._elementByteOffset = 0;
      }
      // Elements of user-defined type arrays get their own internal array
      // symbols named t().element.
      const elementArray = !element && variable.array ? '()' : '';
      for (const {name: elementName, type: elementType} of variable.type.elements) {
        const element = {
          name: `${variable.name}${elementArray}.${elementName}`,
          type: elementType,
          isAsType: true,
          isParameter: variable.isParameter,
          token: variable.token,
          storageType: variable.storageType,
          shared: variable.shared,
          sharedWith: variable.sharedWith,
          static: variable.static,
          array: this._record.array,
          recordOffset: {
            record: this._record,
            offset: this._elementOffset,
            byteOffset: this._elementByteOffset,
          },
        };
        if (elementType.tag != TypeTag.RECORD) {
          this._elementOffset++;
          this._elementByteOffset += getElementSizeInBytes(element);
        }
        this.defineVariable(element, true);
        variable.elements.set(elementName, element);
      }
    }
    table.set(variable.name, slot);
    if (this._parent && table !== this._parent._symbols) {
      if (variable.isParameter) {
        this._parent._symbols.setParameter(variable);
      } else if (variable.array) {
        this._parent._symbols.setLocalArrayVariable(variable);
      } else {
        this._parent._symbols.setLocalVariable(variable);
      }
    }
  }
  
  defineConstant(name: string, constant: Constant) {
    if (this._symbols.has(name)) {
      throw ParseError.fromToken(constant.token, "Duplicate definition");
    }
    this.checkForConflictingRecordVariables(name, constant.token);
    // Detect a conflict between a global constant and a previously defined
    // local variable name.
    // Note local array variables do not conflict.
    const localVariable = this._symbols.getSomeLocalVariable(name);
    if (localVariable) {
      throw ParseError.fromToken(localVariable.token, "Duplicate definition");
    }
    this._symbols.set(name, {constant});
  }

  defineProcedure(procedure: Procedure) {
    if (this._symbols.has(procedure.name)) {
      throw ParseError.fromToken(procedure.token, "Duplicate definition");
    }
    this.checkForConflictingRecordVariables(procedure.name, procedure.token);
    // Detect a conflict between a procedure name and a previously defined local
    // variable or function parameter name.
    const conflictingLocalVariable = (
      this._symbols.getSomeLocalVariable(procedure.name) ||
      this._symbols.getSomeLocalArrayVariable(procedure.name) ||
      this._symbols.getParameter(procedure.name)
    );
    if (conflictingLocalVariable) {
      throw ParseError.fromToken(conflictingLocalVariable.token, "Duplicate definition");
    }
    if (procedure.result) {
      procedure.result.address = this.allocate(procedure.result.storageType, 1);
    }
    this._symbols.set(procedure.name, {procedure});
  }

  private checkForConflictingRecordVariables(name: string, token: Token) {
    const globalTable = this._parent?._symbols ?? this._symbols;
    const conflict = globalTable.conflictsWithRecordVariable(name);
    if (conflict) {
      throw ParseError.fromToken(token, "Identifier cannot include period");
    }
    globalTable.addPossibleRecordNameConflict(name, token);
  }

  defineFn(procedure: Procedure) {
    const slot = this._symbols.get(procedure.name) ?? {
      defFns: new Map()
    };
    if (!slot.defFns) {
      throw ParseError.fromToken(procedure.token, "Name must start with FN");
    }
    if (slot.defFns.has(procedure.result!.type.tag)) {
      throw ParseError.fromToken(procedure.token, "Duplicate definition");
    }
    slot.defFns.set(procedure.result!.type.tag, procedure);
    this._symbols.set(procedure.name, slot);
  }

  stackSize(): number {
    return this._stackIndex;
  }

  staticSize(): number {
    if (this._parent) {
      return this._parent.staticSize();
    }
    return this._staticIndex;
  }

  allocateArray(variable: Variable) {
    if (!variable.array) {
      throw new Error('expecting array variable')
    }
    if (!variable.array.dynamic) {
      // Parameters are passed by reference so only consume one stack slot.
      const size = variable.isParameter ? 1 : getValueCount(variable);
      if (size > 65535) {
        throw ParseError.fromToken(variable.token, "Subscript out of range");
      }
      // If the array is static, values follow the first address which is
      // always reserved for a descriptor.
      variable.address = this.allocate(variable.storageType, size);
      variable.array.baseAddress = {...variable.address};
      variable.array.baseAddress.index += 1;
      variable.array.storageType = StorageType.STATIC;
    } else {
      variable.address = this.allocate(variable.storageType, 1);
      variable.array.storageType = StorageType.DYNAMIC;
    }
  }

  allocate(storageType: StorageType, size: number): Address {
    switch (storageType) {
      case StorageType.AUTOMATIC:
        return {storageType, index: this.allocateStack(size)};
      case StorageType.STATIC:
        return {storageType, index: this.allocateStatic(size)};
      case StorageType.DYNAMIC:
        throw new Error("dynamic allocation at compile time");
    }
  }

  private checkForInvalidRecordElement(variable: Variable) {
    const prefix = textBeforeFirstPeriod(variable.name);
    if (!prefix) {
      return;
    }
    const symbol = this._symbols.get(prefix);
    if (!symbol) {
      return;
    }
    if (symbol.scalarVariables && symbol.scalarVariables.get(TypeTag.RECORD)) {
      throw ParseError.fromToken(variable.token, "Element not defined");
    }
    if (symbol.arrayVariables && symbol.arrayVariables.get(TypeTag.RECORD)) {
      throw ParseError.fromToken(variable.token, "Identifier cannot include period");
    }
  }

  private isVisible(variable: Variable): boolean {
    return this.defFn() ||
      !!variable.shared ||
      (!!this._name && !!variable.sharedWith?.has(this._name));
  }

  private defFn(): boolean {
    return !!this._name?.startsWith('fn');
  }

  private allocateStack(size: number): number {
    const index = this._stackIndex;
    this._stackIndex += size;
    return index;
  }

  private allocateStatic(size: number): number {
    if (this._parent) {
      return this._parent.allocateStatic(size);
    }
    const index = this._staticIndex;
    this._staticIndex += size;
    return index;
  }
}

function getLookupType({type, isDefaultType, asType}: {type: Type, isDefaultType: boolean, asType?: Type}): Type {
  if (asType && isDefaultType) {
    return asType;
  }
  if (asType?.tag === TypeTag.FIXED_STRING && type.tag === TypeTag.STRING) {
    // Force foo.x$ to find a fixed string in a record.
    return asType;
  }
  return type;
}

function getEntries<T>(map?: TypeToItemMap<T>): T[] {
  return Array.from(map?.values() ?? []);
}