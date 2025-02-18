import { Token } from "antlr4ng";
import { getRecordLength, Type, TypeTag } from "./Types.ts"
import { StorageType, Address } from "./Memory.ts";

export interface Variable {
  name: string;
  type: Type;
  array?: ArrayDescriptor;
  sigil?: string;
  isAsType?: boolean;
  isParameter?: boolean;
  shared?: boolean;
  sharedWith?: Set<string>;
  static?: boolean;
  token: Token;
  elements?: Map<string, Variable>;
  recordOffset?: RecordOffset;
  storageType: StorageType;
  address?: Address;
}

export interface RecordOffset {
  record: Variable;
  offset: number;
}

export interface ArrayDescriptor {
  storageType?: StorageType;
  dynamic?: boolean;
  baseAddress?: Address;
  itemSize?: number;
  dimensions: ArrayBounds[];
}

export interface ArrayBounds {
  lower: number | undefined;
  upper: number | undefined;
}

export function getItemSize(variable: Variable): number {
  return variable.type.tag == TypeTag.RECORD ? getRecordLength(variable.type) : 1;
}

export function getStorageSize(variable: Variable): number {
  const itemSize = getItemSize(variable);
  if (variable.array) {
    let itemCount = 1;
    for (const bounds of variable.array.dimensions) {
      if (bounds.upper === undefined || bounds.lower === undefined) {
        return 1;
      }
      itemCount = itemCount * (1 + bounds.upper - bounds.lower);
    }
    return 1 + itemCount * itemSize;
  }
  return itemSize;
}