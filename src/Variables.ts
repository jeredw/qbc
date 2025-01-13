import { Type } from "./Types.ts"
import { isReference, Value } from "./Values.ts";

export interface Variable {
  name: string;
  type: Type;
  arrayDimensions?: ArrayBounds[];
  value?: Value;
  isAsType?: boolean;
}

export interface ArrayBounds {
  lower: number | undefined;
  upper: number | undefined;
}

export function dereference(variable: Variable): Variable {
  while (variable.value && isReference(variable.value)) {
    variable = variable.value.reference;
  }
  return variable;
}