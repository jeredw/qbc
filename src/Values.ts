import { Type, TypeTag, UserDefinedType } from './Types.ts'

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
  recordType: UserDefinedType;
  elements: Map<string, Value>;
}

export type ArrayValue = {
  tag: TypeTag.ARRAY;
  arrayType: Type;
  elements: Map<number, Value>;
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
  | RecordValue
  | ArrayValue;

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

export function cast(value: Value, desiredType: Type): Value {
  if (value.tag == TypeTag.ERROR) {
    return value;
  }
  if (value.tag == desiredType.tag &&
      value.tag != TypeTag.RECORD &&
      value.tag != TypeTag.ARRAY) {
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
      return isString(value) ? string(value.string.slice(0, desiredType.maxLength - 1)) : TYPE_MISMATCH;
    case TypeTag.RECORD:
      return value.tag == TypeTag.RECORD && value.recordType.name == desiredType.name ?
        value : TYPE_MISMATCH;
    case TypeTag.ARRAY:
      throw new Error("unimplemented");
    case TypeTag.ANY:
      return value;
  }
}

export function getDefaultValueOfType(type: Type): Value {
  switch (type.tag) {
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
      return string("");
    case TypeTag.RECORD:
      return buildDefaultRecord(type);
    case TypeTag.ARRAY:
    case TypeTag.ANY:
      throw new Error("unimplemented");
  }
}

function buildDefaultRecord(recordType: UserDefinedType): Value {
  const value: RecordValue = {
    tag: TypeTag.RECORD,
    recordType,
    elements: new Map()
  }
  for (const {name, type} of recordType.elements) {
    value.elements.set(name, getDefaultValueOfType(type));
  }
  return value;
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
  // TODO: QBasic rounds floats to the nearest even.
  return {tag: TypeTag.INTEGER, number: Math.round(number)};
}

export function long(number: number): Value {
  if (number < -2147483648 || number > 2147483647) {
    return OVERFLOW;
  }
  // TODO: QBasic rounds floats to the nearest even.
  return {tag: TypeTag.LONG, number: Math.round(number)};
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
  ILLEGAL_FUNCTION_CALL = error('Illegal function call'),
  RETURN_WITHOUT_GOSUB = error('RETURN without GOSUB');