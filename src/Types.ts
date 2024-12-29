export enum QBasicType {
  ERROR,  // Sentinel value for errors.
  STRING,
  SINGLE,
  DOUBLE,
  INTEGER,
  LONG,
  FIXED_STRING,
  RECORD,
}

export interface StringType {
  qbasicType: QBasicType.STRING;
}

export interface SingleType {
  qbasicType: QBasicType.SINGLE;
}

export interface DoubleType {
  qbasicType: QBasicType.DOUBLE;
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

function typeOfSigil(sigil: string): Type {
  switch (sigil) {
    case '!': return {qbasicType: QBasicType.SINGLE};
    case '#': return {qbasicType: QBasicType.DOUBLE};
    case '$': return {qbasicType: QBasicType.STRING};
    case '%': return {qbasicType: QBasicType.INTEGER};
    case '&': return {qbasicType: QBasicType.LONG};
  }
  throw new Error("Invalid type sigil");
}