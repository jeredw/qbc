import { Token } from "antlr4ng";
import { getRecordLength, Type, TypeTag } from "./Types.ts"
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
  elementOffset?: number;
  itemSize?: number;
}

export interface ArrayBounds {
  lower: number | undefined;
  upper: number | undefined;
}

export function isArray(variable: Variable) {
  return variable.arrayDimensions && variable.arrayDimensions.length > 0;
}

export function getItemSize(variable: Variable): number {
  return variable.type.tag == TypeTag.RECORD ?
    getRecordLength(variable.type) : 1;
}

export function getStorageSize(variable: Variable): number {
  const itemSize = getItemSize(variable);
  if (isArray(variable)) {
    let itemCount = 1;
    for (const bounds of variable.arrayDimensions!) {
      if (bounds.upper === undefined || bounds.lower === undefined) {
        return 0;
      }
      itemCount = itemCount * (1 + bounds.upper - bounds.lower);
    }
    return itemCount * itemSize;
  }
  return itemSize;
}