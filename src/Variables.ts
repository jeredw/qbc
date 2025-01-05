import { Type } from "./Types.ts"

export interface Variable {
  name: string;
  type: Type;
  arrayDimensions?: ArrayBounds[];
}

export interface ArrayBounds {
  lower: number | undefined;
  upper: number | undefined;
}