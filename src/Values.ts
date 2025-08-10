import { Token } from 'antlr4ng';
import { sameType, Type, TypeTag } from './Types.ts'
import type { ArrayDescriptor, Variable } from './Variables.ts'
import { Address } from './Memory.ts';
import { OVERFLOW, TYPE_MISMATCH } from './Errors.ts';
import { roundToNearestEven } from "./Math.ts";

export type ErrorValue = {
  tag: TypeTag.ERROR;
  errorCode: number;
  errorMessage: string
}

export type StringValue = {
  tag: TypeTag.STRING | TypeTag.FIXED_STRING;
  string: string;
  // Set by the FIELD statement.  If present, this string value is notionally
  // backed by a slice of a random access file buffer, and in-place writes (by
  // GET, LSET, RSET, and MID$=) are copied to the buffer and all other string
  // fields for the buffer.
  field?: FieldReference;
};

export interface FieldReference {
  buffer: number[];
  offset: number;
  width: number;
  fields: StringValue[];
}

export type SingleValue = {
  tag: TypeTag.SINGLE;
  number: number;
};

export type DoubleValue = {
  tag: TypeTag.DOUBLE;
  number: number;
};

export type IntegerValue = {
  tag: TypeTag.INTEGER;
  number: number;
}

export type LongValue = {
  tag: TypeTag.LONG;
  number: number;
}

export type ReferenceValue = {
  tag: TypeTag.REFERENCE;
  variable: Variable;
  address: Address;
}

export type ArrayValue = {
  tag: TypeTag.ARRAY;
  array: Variable;
  descriptor: ArrayDescriptor;
}

export type NumericValue =
  | SingleValue
  | DoubleValue
  | IntegerValue
  | LongValue;

export type Value =
  | ErrorValue
  | StringValue
  | NumericValue
  | ReferenceValue
  | ArrayValue;

export type Constant = {
  value: Value;
  token: Token;
}

export function isError(value: Value): value is ErrorValue {
  return 'errorMessage' in value;
}

export function isString(value: Value): value is StringValue {
  return 'string' in value;
}

export function isNumeric(value: Value): value is NumericValue {
  return 'number' in value;
}

export function isReference(value: Value): value is ReferenceValue {
  return 'variable' in value;
}

export function isArray(value: Value): value is ArrayValue {
  return 'array' in value;
}

export function numericTypeOf(a: NumericValue): (number: number) => Value {
  return valueOfNumericType(a.tag);
}

export function valueOfNumericType(tag: TypeTag): (number: number) => Value {
  switch (tag) {
    case TypeTag.SINGLE: return single;
    case TypeTag.DOUBLE: return double;
    case TypeTag.INTEGER: return integer;
    case TypeTag.LONG: return long;
  }
  throw new Error('not numeric');
}

export function mostPreciseFloatType(a: NumericValue, b: NumericValue): (number: number) => Value {
  if (a.tag == TypeTag.DOUBLE || b.tag == TypeTag.DOUBLE) {
    return double;
  }
  return single;
}

export function mostPreciseType(a: NumericValue, b: NumericValue): (number: number) => Value {
  if (a.tag == TypeTag.DOUBLE || b.tag == TypeTag.DOUBLE) {
    return double;
  }
  if (a.tag == TypeTag.SINGLE || b.tag == TypeTag.SINGLE) {
    return single;
  }
  if (a.tag == TypeTag.LONG || b.tag == TypeTag.LONG) {
    return long;
  }
  return integer;
}

export function cast(value: Value, desiredType: Type): Value {
  if (value.tag == TypeTag.ERROR) {
    return value;
  }
  switch (desiredType.tag) {
    case TypeTag.SINGLE:
      return isNumeric(value) ? single(value.number) : TYPE_MISMATCH;
    case TypeTag.DOUBLE:
      return isNumeric(value) ? double(value.number) : TYPE_MISMATCH;
    case TypeTag.STRING:
      return isString(value) ? string(value.string) : TYPE_MISMATCH;
    case TypeTag.INTEGER:
      return isNumeric(value) ? integer(value.number) : TYPE_MISMATCH;
    case TypeTag.LONG:
      return isNumeric(value) ? long(value.number) : TYPE_MISMATCH;
    case TypeTag.FIXED_STRING:
      return isString(value) ? string(value.string.slice(0, desiredType.maxLength).padEnd(desiredType.maxLength)) : TYPE_MISMATCH;
    case TypeTag.RECORD:
      return isReference(value) && sameType(value.variable.type, desiredType) ? value : TYPE_MISMATCH;
    case TypeTag.ANY:
      return value;
    case TypeTag.NUMERIC:
      return isNumeric(value) ? value : TYPE_MISMATCH;
    case TypeTag.PRINTABLE:
      return isNumeric(value) || isString(value) ? value : TYPE_MISMATCH;
  }
}

export function typeOfValue(value: Value): Type {
  switch (value.tag) {
    case TypeTag.SINGLE:
    case TypeTag.DOUBLE:
    case TypeTag.INTEGER:
    case TypeTag.LONG:
      return {tag: value.tag};
    case TypeTag.STRING:
    case TypeTag.FIXED_STRING:
      return {tag: TypeTag.STRING};
  }
  throw new Error("unimplemented");
}

export function getDefaultValue(variable: Variable): Value {
  switch (variable.type.tag) {
    case TypeTag.SINGLE:
      return single(0);
    case TypeTag.DOUBLE:
      return double(0);
    case TypeTag.STRING:
      return string("");
    case TypeTag.INTEGER:
      return integer(0);
    case TypeTag.LONG:
      return long(0);
    case TypeTag.FIXED_STRING:
      return string("\x00".repeat(variable.type.maxLength));
    case TypeTag.RECORD:
    case TypeTag.ANY:
    case TypeTag.NUMERIC:
    case TypeTag.PRINTABLE:
      throw new Error("unimplemented");
  }
}

export function error(errorCode: number, errorMessage: string = ""): ErrorValue {
  return {tag: TypeTag.ERROR, errorCode, errorMessage};
}

export function string(string: string = ""): Value {
  return {tag: TypeTag.STRING, string};
}

export function single(number: number): Value {
  if (!isFinite(number) || number < -3.402823e+38 || number > 3.402823e+38) {
    return OVERFLOW;
  }
  return {tag: TypeTag.SINGLE, number: Math.fround(number)};
}

export function double(number: number): Value {
  if (!isFinite(number)) {
    return OVERFLOW;
  }
  return {tag: TypeTag.DOUBLE, number};
}

export function integer(number: number): Value {
  if (number < -32768 || number > 32767) {
    return OVERFLOW;
  }
  return {tag: TypeTag.INTEGER, number: roundToNearestEven(number)};
}

export function long(number: number): Value {
  if (number < -2147483648 || number > 2147483647) {
    return OVERFLOW;
  }
  return {tag: TypeTag.LONG, number: roundToNearestEven(number)};
}

export function boolean(test: boolean): Value {
  return test ? integer(TRUE) : integer(FALSE);
}

export function reference(variable: Variable, address?: Address): Value {
  address = address ?? variable.address;
  if (!address) {
    throw new Error('cannot reference unallocated variable');
  }
  return {tag: TypeTag.REFERENCE, variable, address};
}

export function array(array: Variable, descriptor: ArrayDescriptor): Value {
  return {tag: TypeTag.ARRAY, array, descriptor};
}

export function debugPrintVariable(variable: Variable): string {
  if (variable.type.tag === TypeTag.RECORD) {
    let result = `[${variable.type.name}]`;
    for (const [name, element] of variable.elements ?? []) {
      result += `${name}: ${debugPrintVariable(element)}\n`;
    }
    return result;
  }
  return debugPrintValue(variable.debugValue ?? getDefaultValue(variable));
}

export function debugPrintValue(value: Value): string {
  switch (value.tag) {
    case TypeTag.STRING:
    case TypeTag.FIXED_STRING:
      return `"${value.string}"`;
    case TypeTag.SINGLE:
      return `${value.number}!`;
    case TypeTag.DOUBLE:
      return `${value.number}#`;
    case TypeTag.INTEGER:
      return `${value.number}%`;
    case TypeTag.LONG:
      return `${value.number}&`;
  }
  return "";
}

export const
  TRUE = -1,
  FALSE = 0;