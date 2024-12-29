import { TypeTag, UserDefinedType } from './Types.ts'

export type ErrorValue = {
  tag: TypeTag.ERROR;
  errorMessage: string
}

export type StringValue = {
  tag: TypeTag.STRING | TypeTag.FIXED_STRING;
  string: string;
};

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

export type RecordValue = {
  tag: TypeTag.RECORD;
  userDefinedType: UserDefinedType;
  elementValues: Map<string, Value>;
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
  | RecordValue;

export function isError(value: Value): value is ErrorValue {
  return 'errorMessage' in value;
}

export function isString(value: Value): value is StringValue {
  return 'string' in value;
}

export function isNumeric(value: Value): value is NumericValue {
  return 'number' in value;
}

export function numericTypeOf(a: NumericValue): (number: number) => Value {
  switch (a.tag) {
    case TypeTag.SINGLE: return single;
    case TypeTag.DOUBLE: return double;
    case TypeTag.INTEGER: return integer;
    case TypeTag.LONG: return long;
  }
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

export function error(errorMessage: string = ""): ErrorValue {
  return {tag: TypeTag.ERROR, errorMessage};
}

export function string(string: string = ""): Value {
  return {tag: TypeTag.STRING, string};
}

export function single(number: number): Value {
  if (!isFinite(number) || number < -1.401298e-45 || number > 3.402823e+38) {
    return OVERFLOW;
  }
  return {tag: TypeTag.SINGLE, number};
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
  return {tag: TypeTag.INTEGER, number};
}

export function long(number: number): Value {
  if (number < -2147483648 || number > 2147483647) {
    return OVERFLOW;
  }
  return {tag: TypeTag.LONG, number};
}

export function boolean(test: boolean): Value {
  return test ? integer(TRUE) : integer(FALSE);
}

export const
  TRUE = -1,
  FALSE = 0;

export const 
  OVERFLOW = error('Overflow'),
  ILLEGAL_NUMBER = error('Illegal number'),
  TYPE_MISMATCH = error('Type mismatch'),
  DIVISION_BY_ZERO = error('Division by zero'),
  ILLEGAL_FUNCTION_CALL = error('Illegal function call');