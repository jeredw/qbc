import { Type } from "./Types.ts"

export interface Variable {
  name: string;
  type: Type;
  arrayDimensions?: ArrayBounds[];
}

export type Dimensions =
  | ArrayBounds[]
  | DynamicArray;

export interface ArrayBounds {
  lower: number;
  upper: number;
}

export interface DynamicArray {
  numDimensions: number;
}
