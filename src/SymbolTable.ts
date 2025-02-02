import { Token } from "antlr4ng";
import { Procedure } from "./Procedures";
import { sameType, Type, TypeTag } from "./Types";
import { Constant, record } from "./Values";
import { Variable } from "./Variables";
import { ParseError } from "./Errors";

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
  constant: Constant;
}

export interface VariableSymbol {
  tag: SymbolTag.VARIABLE;
  variable: Variable;
}

export type QBasicSymbol =
  | ProcedureSymbol
  | ConstantSymbol
  | VariableSymbol;

export function isVariable(symbol: QBasicSymbol): symbol is VariableSymbol {
  return 'variable' in symbol;
}

export function isConstant(symbol: QBasicSymbol): symbol is ConstantSymbol {
  return 'constant' in symbol;
}

export function isProcedure(symbol: QBasicSymbol): symbol is ProcedureSymbol {
  return 'procedure' in symbol;
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
  private _parent: SymbolTable | undefined;
  private _symbols: NameToSlotMap = new NameToSlotMap();
  
  constructor(parent?: SymbolTable) {
    this._parent = parent;
  }

  lookupConstant(name: string): Constant | undefined {
    return this._symbols.get(name)?.constant ?? this._parent?.lookupConstant(name);
  }

  lookupProcedure(name: string): Procedure | undefined {
    return this._symbols.get(name)?.procedure ?? this._parent?.lookupProcedure(name);
  }

  // Look up a name, and if it is not found, define a new variable with that
  // name and the given type.
  lookupOrDefineVariable({name, type, isDefaultType, numDimensions, token}: {
      name: string,
      type: Type,
      isDefaultType: boolean,
      numDimensions: number
      token: Token
    }): QBasicSymbol {
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
      if (slot.constant && (isDefaultType || slot.constant.value.tag == type.tag)) {
        return {tag: SymbolTag.CONSTANT, constant: slot.constant};
      }
      if (numDimensions == 0 && slot.scalarVariables) {
        const asType = slot.scalarAsType ?? slot.arrayAsType;
        if (asType && isDefaultType) {
          type = asType;
        }
        if (!asType || sameType(asType, type)) {
          const variable = slot.scalarVariables.get(type.tag);
          if (variable) {
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
    const variable = { name, type, token, ...arrayDimensions };
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
    const slot = this._symbols.get(variable.name) ?? {};
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
      const elements: Map<string, Variable> = new Map();
      for (const {name: elementName, type: elementType} of variable.type.elements) {
        const element = {
          name: `${variable.name}.${elementName}`,
          type: elementType,
          isAsType: true,
          isParameter: variable.isParameter,
          token: variable.token,
          // TODO: Array elements
        };
        this.defineVariable(element);
        elements.set(elementName, element);
      }
      variable.value = record(variable.type, elements);
    }
    if (!variable.arrayDimensions) {
      const asType = slot.scalarAsType ?? slot.arrayAsType;
      if (asType && !sameType(asType, variable.type)) {
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
    } else {
      const asType = slot.arrayAsType ?? slot.scalarAsType;
      if (asType && !sameType(asType, variable.type)) {
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
    }
    this._symbols.set(variable.name, slot);
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
  }
}

function getTokens(map?: TypeToItemMap<Procedure|Variable>): Token[] {
  return map ? Array.from(map.values()).map((item) => item.token) : [];
}