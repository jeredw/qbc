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

export interface PrimitiveType {
  qbasicType: QBasicType.STRING
            | QBasicType.SINGLE
            | QBasicType.DOUBLE
            | QBasicType.INTEGER
            | QBasicType.LONG;
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
  | PrimitiveType
  | FixedStringType
  | UserDefinedType;