import { Procedure } from "./Procedures";
import { sameType, Type, TypeTag } from "./Types";
import { Value } from "./Values";
import { Variable } from "./Variables";

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
  VARIABLE
}

export interface ProcedureSymbol {
  tag: SymbolTag.PROCEDURE;
  procedure: Procedure;
}

export interface ConstantSymbol {
  tag: SymbolTag.CONSTANT;
  constant: Value;
}

export interface VariableSymbol {
  tag: SymbolTag.VARIABLE;
  variable: Variable;
}

export type Symbol =
  | ProcedureSymbol
  | ConstantSymbol
  | VariableSymbol;

export function isVariable(symbol: Symbol): symbol is VariableSymbol {
  return 'variable' in symbol;
}

export function isConstant(symbol: Symbol): symbol is ConstantSymbol {
  return 'constant' in symbol;
}

export function isProcedure(symbol: Symbol): symbol is ProcedureSymbol {
  return 'procedure' in symbol;
}

type TypeToItemMap<T> = Map<TypeTag, T>

interface Slot {
  procedure?: Procedure;
  constant?: Value;
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
  private _parent: SymbolTable | undefined;
  private _symbols: NameToSlotMap = new NameToSlotMap();
  
  constructor(parent?: SymbolTable) {
    this._parent = parent;
  }

  lookupConstant(name: string): Value | undefined {
    return this._symbols.get(name)?.constant ?? this._parent?.lookupConstant(name);
  }

  lookupProcedure(name: string): Procedure | undefined {
    return this._symbols.get(name)?.procedure ?? this._parent?.lookupProcedure(name);
  }

  // Look up a name, and if it is not found, define a new variable with that
  // name and the given type.
  lookupOrDefineVariable({name, type, isDefaultType, numDimensions}: {
      name: string,
      type: Type,
      isDefaultType: boolean,
      numDimensions: number
    }): Symbol {
    const slot = this._symbols.get(name) ?? this._parent?._symbols.get(name);
    if (slot) {
      // If a name is found with the wrong type, we fall through to trying to
      // define a variable below and throw "Duplicate definition".
      if (slot.procedure && (!slot.procedure.result || sameType(type, slot.procedure.result.type))) {
        return {tag: SymbolTag.PROCEDURE, procedure: slot.procedure};
      }
      if (slot.defFns) {
        const procedure = slot.defFns.get(type.tag);
        if (procedure) {
          return {tag: SymbolTag.PROCEDURE, procedure};
        }
      }
      if (slot.constant && (isDefaultType || slot.constant.tag == type.tag)) {
        return {tag: SymbolTag.CONSTANT, constant: slot.constant};
      }
      if (numDimensions == 0 && slot.scalarVariables) {
        const asType = isDefaultType ? slot.scalarAsType :
          (slot.scalarAsType ?? slot.arrayAsType);
        if (!asType || sameType(asType, type)) {
          const variable = slot.scalarVariables.get(type.tag);
          if (variable) {
            return {tag: SymbolTag.VARIABLE, variable};
          }
        }
      }
      if (numDimensions > 0 && slot.arrayVariables) {
        const asType = isDefaultType ? slot.arrayAsType :
          (slot.arrayAsType ?? slot.scalarAsType);
        if (!asType || sameType(asType, type)) {
          const variable = slot.arrayVariables.get(type.tag);
          if (variable) {
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
    const variable = { name, type, ...arrayDimensions };
    this.defineVariable(variable);
    return { tag: SymbolTag.VARIABLE, variable };
  }

  getAsType(name: string): Type | undefined {
    const slot = this._symbols.get(name) ?? this._parent?._symbols.get(name);
    return slot?.scalarAsType ?? slot?.arrayAsType;
  }

  defineVariable(variable: Variable) {
    const slot = this._symbols.get(variable.name) ?? {};
    if (slot.procedure || slot.constant) {
      throw new Error("Duplicate definition");
    }
    if (slot.defFns) {
      throw new Error("Cannot start with FN");
    }
    if (!variable.arrayDimensions) {
      const asType = slot.scalarAsType ?? slot.arrayAsType;
      if (asType && !sameType(asType, variable.type)) {
        throw new Error("Duplicate definition")
      }
      if (variable.isAsType) {
        slot.scalarAsType = variable.type;
      }
      if (!slot.scalarVariables) {
        slot.scalarVariables = new Map();
      }
      if (slot.scalarVariables.has(variable.type.tag)) {
        throw new Error("Duplicate definition");
      }
      slot.scalarVariables.set(variable.type.tag, variable);
    } else {
      const asType = slot.arrayAsType ?? slot.scalarAsType;
      if (asType && !sameType(asType, variable.type)) {
        throw new Error("Duplicate definition")
      }
      if (variable.isAsType) {
        slot.arrayAsType = variable.type;
      }
      if (!slot.arrayVariables) {
        slot.arrayVariables = new Map();
      }
      if (slot.arrayVariables.has(variable.type.tag)) {
        throw new Error("Array already dimensioned");
      }
      slot.arrayVariables.set(variable.type.tag, variable);
    }
    this._symbols.set(variable.name, slot);
  }
  
  defineConstant(name: string, constant: Value) {
    if (this._symbols.has(name)) {
      throw new Error("Duplicate definition");
    }
    this._symbols.set(name, {constant});
  }

  defineProcedure(procedure: Procedure) {
    if (this._symbols.has(procedure.name)) {
      throw new Error("Duplicate definition");
    }
    this._symbols.set(procedure.name, {procedure});
  }

  defineFn(procedure: Procedure) {
    const slot = this._symbols.get(procedure.name) ?? {
      defFns: new Map()
    };
    if (!slot.defFns) {
      throw new Error("Name must start with FN");
    }
    if (slot.defFns.has(procedure.result!.type.tag)) {
      throw new Error("Duplicate definition");
    }
    slot.defFns.set(procedure.result!.type.tag, procedure);
  }
}