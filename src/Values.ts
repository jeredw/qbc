import { QBasicType, UserDefinedType } from './Types.ts'

export type ErrorValue = {
  qbasicType: QBasicType.ERROR;
  errorMessage: string
}

export type StringValue = {
  qbasicType: QBasicType.STRING | QBasicType.FIXED_STRING;
  string: string;
};

export type SingleValue = {
  qbasicType: QBasicType.SINGLE;
  number: number;
};

export type DoubleValue = {
  qbasicType: QBasicType.DOUBLE;
  number: number;
};

export type IntegerValue = {
  qbasicType: QBasicType.INTEGER;
  number: number;
}

export type LongValue = {
  qbasicType: QBasicType.LONG;
  number: number;
}

export type RecordValue = {
  qbasicType: QBasicType.RECORD;
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
  switch (a.qbasicType) {
    case QBasicType.SINGLE: return single;
    case QBasicType.DOUBLE: return double;
    case QBasicType.INTEGER: return integer;
    case QBasicType.LONG: return long;
  }
}

export function mostPreciseType(a: NumericValue, b: NumericValue): (number: number) => Value {
  if (a.qbasicType == QBasicType.DOUBLE || b.qbasicType == QBasicType.DOUBLE) {
    return double;
  }
  if (a.qbasicType == QBasicType.SINGLE || b.qbasicType == QBasicType.SINGLE) {
    return single;
  }
  if (a.qbasicType == QBasicType.LONG || b.qbasicType == QBasicType.LONG) {
    return long;
  }
  return integer;
}

export function error(errorMessage: string = ""): ErrorValue {
  return {qbasicType: QBasicType.ERROR, errorMessage};
}

export function string(string: string = ""): Value {
  return {qbasicType: QBasicType.STRING, string};
}

export function single(number: number): Value {
  if (!isFinite(number) || number < -1.401298e-45 || number > 3.402823e+38) {
    return OVERFLOW;
  }
  return {qbasicType: QBasicType.SINGLE, number};
}

export function double(number: number): Value {
  if (!isFinite(number)) {
    return OVERFLOW;
  }
  return {qbasicType: QBasicType.DOUBLE, number};
}

export function integer(number: number): Value {
  if (number < -32768 || number > 32767) {
    return OVERFLOW;
  }
  return {qbasicType: QBasicType.INTEGER, number};
}

export function long(number: number): Value {
  if (number < -2147483648 || number > 2147483647) {
    return OVERFLOW;
  }
  return {qbasicType: QBasicType.LONG, number};
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