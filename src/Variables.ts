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