import { Type } from "./Types.ts"

export interface Variable {
  type: Type;
  name: string;
  arrayDimensions?: ArrayBounds[];
}

export interface ArrayBounds {
  lower: number;
  upper: number;
}