import { Token } from "antlr4ng";
import { Type } from "./Types.ts"
import { StorageType, Address } from "./Memory.ts";

export interface Variable {
  name: string;
  type: Type;
  arrayDimensions?: ArrayBounds[];
  sigil?: string;
  isAsType?: boolean;
  isParameter?: boolean;
  shared?: boolean;
  sharedWith?: Set<string>;
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

export function isArray(variable: Variable) {
  return variable.arrayDimensions && variable.arrayDimensions.length > 0;
}

export function getStorageSize(variable: Variable): number {
  if (isArray(variable)) {
    let size = 1;
    for (const bounds of variable.arrayDimensions!) {
      if (bounds.upper === undefined || bounds.lower === undefined) {
        return 0;
      }
      size = size * (1 + bounds.upper - bounds.lower);
    }
    return size;
  }
  return 1;
}