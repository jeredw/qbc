export enum QBasicType {
  ERROR,  // Sentinel value for errors.
  SINGLE,
  DOUBLE,
  STRING,
  INTEGER,
  LONG,
  FIXED_STRING,
  RECORD,
}

export interface SingleType {
  qbasicType: QBasicType.SINGLE;
}

export interface DoubleType {
  qbasicType: QBasicType.DOUBLE;
}

export interface StringType {
  qbasicType: QBasicType.STRING;
}

export interface IntegerType {
  qbasicType: QBasicType.INTEGER;
}

export interface LongType {
  qbasicType: QBasicType.LONG;
}

export interface FixedStringType {
  qbasicType: QBasicType.FIXED_STRING;
  maxLength: number;
}

export interface UserDefinedTypeElement {
  name: string;
  type: Type;
}

export interface UserDefinedType {
  qbasicType: QBasicType.RECORD;
  name: string;
  elements: UserDefinedTypeElement[];
}

export type Type =
  | StringType
  | SingleType
  | DoubleType
  | IntegerType
  | LongType
  | FixedStringType
  | UserDefinedType;

export function typeOfSigil(sigil: string): Type {
  switch (sigil) {
    case '!': return {qbasicType: QBasicType.SINGLE};
    case '#': return {qbasicType: QBasicType.DOUBLE};
    case '$': return {qbasicType: QBasicType.STRING};
    case '%': return {qbasicType: QBasicType.INTEGER};
    case '&': return {qbasicType: QBasicType.LONG};
  }
  throw new Error("Invalid type sigil");
}

export function typeOfName(typeName: string): Type {
  switch (typeName.toLowerCase()) {
    case 'single': return {qbasicType: QBasicType.SINGLE};
    case 'double': return {qbasicType: QBasicType.DOUBLE};
    case 'string': return {qbasicType: QBasicType.STRING};
    case 'integer': return {qbasicType: QBasicType.INTEGER};
    case 'long': return {qbasicType: QBasicType.LONG};
  }
  throw new Error("Invalid type name");
}

export function typeOfDefType(keyword: string): Type {
  switch (keyword.toLowerCase()) {
    case 'defsng': return {qbasicType: QBasicType.SINGLE};
    case 'defdbl': return {qbasicType: QBasicType.DOUBLE};
    case 'defstr': return {qbasicType: QBasicType.STRING};
    case 'defint': return {qbasicType: QBasicType.INTEGER};
    case 'deflng': return {qbasicType: QBasicType.LONG};
  }
  throw new Error("Invalid keyword");
}