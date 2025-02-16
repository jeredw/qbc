import { Token } from "antlr4ng";
import { Procedure } from "./Procedures.ts";
import { isNumericType, sameType, Type, TypeTag } from "./Types.ts";
import { Constant } from "./Values.ts";
import { getStorageSize, Variable } from "./Variables.ts";
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

export enum SymbolTag {
  PROCEDURE,
  CONSTANT,
  VARIABLE,
  BUILTIN,
}

export interface ProcedureSymbol {
  tag: SymbolTag.PROCEDURE;
  procedure: Procedure;
}

export interface ConstantSymbol {
  tag: SymbolTag.CONSTANT;
  constant: Constant;
}

export interface VariableSymbol {
  tag: SymbolTag.VARIABLE;
  variable: Variable;
}

export interface BuiltinSymbol {
  tag: SymbolTag.BUILTIN;
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

interface Slot {
  procedure?: Procedure;
  constant?: Constant;
  defFns?: TypeToItemMap<Procedure>;
  scalarVariables?: TypeToItemMap<Variable>;
  arrayVariables?: TypeToItemMap<Variable>;
  scalarAsType?: Type;
  arrayAsType?: Type;
}

class NameToSlotMap {
  private _map: Map<string, Slot> = new Map();

  get(name: string): Slot | undefined {
    return this._map.get(canonicalName(name));
  }

  findPrefixDot(rawPrefix: string): Slot | undefined {
    const prefix = canonicalName(rawPrefix);
    for (const [name, slot] of this._map) {
      if (name.startsWith(`${prefix}.`)) {
        return slot;
      }
    }
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

  has(name: string) {
    return this._map.has(canonicalName(name));
  }
}

function canonicalName(name: string): string {
  return name.toLowerCase();
}

export class SymbolTable {
  private _builtins: StandardLibrary;
  private _parent: SymbolTable | undefined;
  private _name?: string;
  private _symbols: NameToSlotMap = new NameToSlotMap();
  private _stackIndex: number;
  private _staticIndex: number;
  
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

  // Look up a name, and if it is not found, define a new variable with that
  // name and the given type.
  lookupOrDefineVariable({name, type, sigil, numDimensions, token, storageType, isAsType}: {
      name: string,
      type: Type,
      sigil?: string,
      numDimensions: number,
      token: Token,
      storageType: StorageType,
      isAsType: boolean,
    }): QBasicSymbol {
    const builtin = this.lookupBuiltin(name, sigil, token);
    if (builtin) {
      return {tag: SymbolTag.BUILTIN, builtin};
    }
    const mySlot = this._symbols.get(name);
    const parentSlot = this._parent?._symbols.get(name);
    const slot = mySlot ?? parentSlot;
    const isDefaultType = !sigil;
    if (slot) {
      if (slot.procedure) {
        if (!slot.procedure.result || sameType(type, slot.procedure.result.type)) {
          return {tag: SymbolTag.PROCEDURE, procedure: slot.procedure};
        }
        throw ParseError.fromToken(token, "Duplicate definition");
      }
      if (slot.defFns) {
        const procedure = slot.defFns.get(type.tag);
        if (procedure) {
          return {tag: SymbolTag.PROCEDURE, procedure};
        }
        throw ParseError.fromToken(token, "Duplicate definition");
      }
      if (slot.constant) {
        if (isDefaultType || slot.constant.value.tag == type.tag) {
          return {tag: SymbolTag.CONSTANT, constant: slot.constant};
        }
        throw ParseError.fromToken(token, "Duplicate definition");
      }
      if (numDimensions == 0 && slot.scalarVariables) {
        const asType = slot.scalarAsType ?? slot.arrayAsType;
        if (asType && isDefaultType) {
          type = asType;
        }
        if (!asType || sameType(asType, type)) {
          const variable = slot.scalarVariables.get(type.tag);
          if (variable && this.isVisible(variable, slot, mySlot)) {
            return {tag: SymbolTag.VARIABLE, variable};
          }
        }
      }
      if (numDimensions > 0 && slot.arrayVariables) {
        const asType = slot.arrayAsType ?? slot.scalarAsType;
        if (asType && isDefaultType) {
          type = asType;
        }
        if (!asType || sameType(asType, type)) {
          const variable = slot.arrayVariables.get(type.tag);
          if (variable && this.isVisible(variable, slot, mySlot)) {
            if (!variable.arrayDimensions) {
              throw new Error("missing array dimensions");
            }
            if (variable.arrayDimensions.length != numDimensions) {
              throw ParseError.fromToken(token, "Wrong number of dimensions");
            }
            return {tag: SymbolTag.VARIABLE, variable};
          }
        }
      }
    }
    const arrayDimensions = numDimensions > 0 ? {
      arrayDimensions: new Array(numDimensions).fill({
        lower: 1, upper: 10  // TODO: option base
      })
    } : {};
    const variable = { name, type, sigil, token, storageType, isAsType, ...arrayDimensions };
    this.defineVariable(variable);
    return { tag: SymbolTag.VARIABLE, variable };
  }

  getAsType(name: string): Type | undefined {
    const slot = this._symbols.get(name) ?? this._parent?._symbols.get(name);
    return slot?.scalarAsType ?? slot?.arrayAsType;
  }

  variables(): Variable[] {
    return this._symbols.variables();
  }

  defineVariable(variable: Variable) {
    const builtin = this.lookupBuiltin(variable.name, variable.sigil, variable.token);
    if (builtin) {
      throw ParseError.fromToken(variable.token, "Duplicate definition");
    }
    const table = this.defFn() && !variable.static && !variable.isParameter ?
      this._parent!._symbols :
      this._symbols;
    const slot = table.get(variable.name) ?? {};
    if (slot.procedure || slot.constant) {
      throw ParseError.fromToken(variable.token, "Duplicate definition");
    }
    if (slot.defFns) {
      throw ParseError.fromToken(variable.token, "Cannot start with FN");
    }
    if (variable.type.tag == TypeTag.RECORD) {
      const conflicts = this._symbols.findPrefixDot(variable.name);
      if (conflicts) {
        const tokens = [
          getTokens(conflicts.arrayVariables),
          getTokens(conflicts.scalarVariables),
          getTokens(conflicts.defFns),
          conflicts.procedure?.token,
          conflicts.constant?.token,
        ].flat().filter((x) => !!x);
        if (!tokens.length) {
          throw new Error("expecting conflict token");
        }
        throw ParseError.fromToken(tokens[0], "Identifier cannot include period");
      }
      variable.elements = new Map();
      for (const {name: elementName, type: elementType} of variable.type.elements) {
        const element = {
          name: `${variable.name}.${elementName}`,
          type: elementType,
          isAsType: true,
          isParameter: variable.isParameter,
          token: variable.token,
          storageType: variable.storageType,
          // TODO: Array elements
        };
        this.defineVariable(element);
        variable.elements.set(elementName, element);
      }
    }
    if (!variable.arrayDimensions) {
      const asType = slot.scalarAsType ?? slot.arrayAsType;
      if (asType && variable.isAsType && !sameType(asType, variable.type)) {
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
      variable.address = this.allocate(variable.storageType, 1);
    } else {
      const asType = slot.arrayAsType ?? slot.scalarAsType;
      if (asType && variable.isAsType && !sameType(asType, variable.type)) {
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
      const size = getStorageSize(variable);
      if (size == 0) {
        variable.storageType = StorageType.DYNAMIC;
      } else if (size > 65535) {
        throw ParseError.fromToken(variable.token, "Subscript out of range");
      } else if (variable.storageType != StorageType.DYNAMIC) {
        variable.address = this.allocate(variable.storageType, size);
      }
    }
    table.set(variable.name, slot);
  }
  
  defineConstant(name: string, constant: Constant) {
    if (this._symbols.has(name)) {
      throw ParseError.fromToken(constant.token, "Duplicate definition");
    }
    this._symbols.set(name, {constant});
  }

  defineProcedure(procedure: Procedure) {
    if (this._symbols.has(procedure.name)) {
      throw ParseError.fromToken(procedure.token, "Duplicate definition");
    }
    if (procedure.result) {
      procedure.result.address = this.allocate(procedure.result.storageType, 1);
    }
    this._symbols.set(procedure.name, {procedure});
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

  private isVisible(variable: Variable, slot: Slot, mySlot?: Slot): boolean {
    return slot === mySlot ||
      this.defFn() ||
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

function getTokens(map?: TypeToItemMap<Procedure|Variable>): Token[] {
  return map ? Array.from(map.values()).map((item) => item.token) : [];
}