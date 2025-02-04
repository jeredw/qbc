import { Token } from "antlr4ng";
import { Type } from "./Types.ts"
import { StorageType, Address } from "./Memory.ts";

export interface Variable {
  name: string;
  type: Type;
  arrayDimensions?: ArrayBounds[];
  isAsType?: boolean;
  isParameter?: boolean;
  shared?: boolean;
  static?: boolean;
  token: Token;
  elements?: Map<string, Variable>;
  storageType: StorageType;
  address?: Address;
}

export interface ArrayBounds {
  lower: number | undefined;
  upper: number | undefined;
}