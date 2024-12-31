import { Procedure } from "./Procedures";
import { splitSigil, Type, TypeTag } from "./Types";
import { Value } from "./Values";
import { Variable } from "./Variables";

export class SymbolTable {
  private _parent: SymbolTable | undefined;
  private _procedures: Map<string, Procedure> = new Map();
  private _fns: Map<TypeTag, Map<string, Procedure>> = new Map([
    [TypeTag.SINGLE, new Map()],
    [TypeTag.DOUBLE, new Map()],
    [TypeTag.STRING, new Map()],
    [TypeTag.INTEGER, new Map()],
    [TypeTag.LONG, new Map()],
  ]);
  private _constants: Map<string, Value> = new Map();

  constructor(parent?: SymbolTable) {
    this._parent = parent;
  }

  defineConstant(name: string, value: Value) {
    this._constants.set(name, value);
  }

  lookupConstant(name: string): Value | undefined {
    return this._constants.get(name);
  }

  defineProcedure(proc: Procedure) {
    this._procedures.set(proc.name, proc);
  }

  defineFn(proc: Procedure) {
    const table = this._fns.get(proc.returnType!.tag)!;
    table.set(proc.name, proc);
  }

  hasFn(name: string, typeTag: TypeTag): boolean {
    const table = this._fns.get(typeTag)!;
    return table.has(name);
  }

  has(name: string): boolean {
    return this._procedures.has(name);
  }
}