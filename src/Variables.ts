import { Type } from "./Types.ts"
import { Value } from "./Values.ts";

export interface Variable {
  name: string;
  type: Type;
  arrayDimensions?: ArrayBounds[];
  value?: Value;
}

export interface ArrayBounds {
  lower: number | undefined;
  upper: number | undefined;
}