import { Type } from "./Types.ts"

export interface Variable {
  type: Type;
  name: string;
  dimensions: ArrayBounds[];
}

export interface ArrayBounds {
  lower: number;
  upper: number;
}

export interface Procedure {
  name: string;
  returnType?: Type;
  arguments: Variable[];
}