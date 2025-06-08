import { Token } from "antlr4ng";
import { getRecordLength, Type, TypeTag } from "./Types.ts"
import { StorageType, Address, Memory } from "./Memory.ts";

export interface Variable {
  name: string;
  type: Type;
  array?: ArrayDescriptor;
  sigil?: string;
  isAsType?: boolean;
  isParameter?: boolean;
  // True for DIM SHARED variables visible to all procedures.
  shared?: boolean;
  // Names of procedures with SHARED declarations for this variable.
  sharedWith?: Set<string>;
  // If true, this variable has only been encountered in a SHARED declaration.
  // If an actual DIM occurs later, it may replace this symbol.
  sharedDeclaration?: boolean;
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
    // Reserve one value for the array descriptor.
    return 1 + itemCount * itemSize;
  }
  return itemSize;
}

export function getScalarVariableSizeInBytes(variable: Variable, memory: Memory, stringsHaveLengthPrefixed?: boolean): number {
  switch (variable.type.tag) {
    case TypeTag.SINGLE:
      return 4;
    case TypeTag.DOUBLE:
      return 8;
    case TypeTag.INTEGER:
      return 2;
    case TypeTag.LONG:
      return 4;
    case TypeTag.FIXED_STRING:
      return variable.type.maxLength;
    case TypeTag.STRING: {
      const value = memory.read(variable);
      if (!value || value.tag !== TypeTag.STRING) {
        return stringsHaveLengthPrefixed ? 2 : 0;
      }
      return stringsHaveLengthPrefixed ? 2 + value.string.length : value.string.length; 
    }
    case TypeTag.RECORD:
      return Array.from(variable.elements?.values() ?? [])
        .map((element: Variable) => getScalarVariableSizeInBytes(element, memory))
        .reduce((acc: number, sum: number) => acc + sum, 0);
  }
  throw new Error("unimplemented");
}