export const TRUE = -1;
export const FALSE = 0;

export enum QBasicType {
  ERROR,  // Sentinel value for errors.
  STRING,
  SINGLE
}

export type ErrorValue = {
  qbasicType: QBasicType.ERROR;
  message: string
}

export type StringValue = {
  qbasicType: QBasicType.STRING;
  data: string;
};

export type SingleValue = {
  qbasicType: QBasicType.SINGLE;
  data: number;
};

export type Value = ErrorValue | StringValue | SingleValue

export function makeError(message: string = ""): Value {
  return {qbasicType: QBasicType.ERROR, message};
}

export function makeString(data: string = ""): Value {
  return {qbasicType: QBasicType.STRING, data};
}

export function makeSingle(data: number): Value {
  return {qbasicType: QBasicType.SINGLE, data};
}