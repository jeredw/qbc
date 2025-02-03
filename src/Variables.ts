import { Token } from "antlr4ng";
import { Type } from "./Types"
import { StorageType, Address } from "./Memory";

export interface Variable {
  name: string;
  type: Type;
  arrayDimensions?: ArrayBounds[];
  isAsType?: boolean;
  isParameter?: boolean;
  token: Token;
  elements?: Map<string, Variable>;
  storageType: StorageType;
  address?: Address;
}

export interface ArrayBounds {
  lower: number | undefined;
  upper: number | undefined;
}