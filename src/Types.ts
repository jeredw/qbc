export enum TypeTag {
  ERROR,  // Sentinel value for errors.
  SINGLE,
  DOUBLE,
  STRING,
  INTEGER,
  LONG,
  FIXED_STRING,
  RECORD,
  ARRAY,
  ANY,
  // Reference is only used for values, not types.
  REFERENCE,
}

export interface SingleType {
  tag: TypeTag.SINGLE;
}

export interface DoubleType {
  tag: TypeTag.DOUBLE;
}

export interface StringType {
  tag: TypeTag.STRING;
}

export interface IntegerType {
  tag: TypeTag.INTEGER;
}

export interface LongType {
  tag: TypeTag.LONG;
}

export interface FixedStringType {
  tag: TypeTag.FIXED_STRING;
  maxLength: number;
}

export interface UserDefinedTypeElement {
  name: string;
  type: Type;
}

export interface UserDefinedType {
  tag: TypeTag.RECORD;
  name: string;
  elements: UserDefinedTypeElement[];
}

export interface ArrayType {
  tag: TypeTag.ARRAY;
  elementType: Type;
  // Array variables have dimensions, but types don't.
}

export interface AnyType {
  tag: TypeTag.ANY;
}

export type Type =
  | StringType
  | SingleType
  | DoubleType
  | IntegerType
  | LongType
  | FixedStringType
  | UserDefinedType
  | ArrayType
  | AnyType;

export function sameType(s: Type, t: Type) {
  if (isString(s) && isString(t)) {
    return true;
  }
  if (s.tag == TypeTag.ANY || t.tag == TypeTag.ANY) {
    return true;
  }
  if (s.tag == TypeTag.RECORD && t.tag == TypeTag.RECORD) {
    return s.name == t.name;
  }
  if (s.tag == TypeTag.ARRAY && t.tag == TypeTag.ARRAY) {
    return sameType(s.elementType, t.elementType);
  }
  return s.tag == t.tag;
}

export function isNumericType(s: Type): boolean {
  return s.tag == TypeTag.SINGLE || s.tag == TypeTag.DOUBLE || s.tag == TypeTag.INTEGER || s.tag == TypeTag.LONG;
}

function isString(s: Type): boolean {
  return s.tag == TypeTag.STRING || s.tag == TypeTag.FIXED_STRING;
}

export function typeOfSigil(sigil: string): Type {
  switch (sigil) {
    case '!': return {tag: TypeTag.SINGLE};
    case '#': return {tag: TypeTag.DOUBLE};
    case '$': return {tag: TypeTag.STRING};
    case '%': return {tag: TypeTag.INTEGER};
    case '&': return {tag: TypeTag.LONG};
  }
  throw new Error("Invalid type sigil");
}

export function typeOfName(typeName: string): Type {
  switch (typeName.toLowerCase()) {
    case 'single': return {tag: TypeTag.SINGLE};
    case 'double': return {tag: TypeTag.DOUBLE};
    case 'string': return {tag: TypeTag.STRING};
    case 'integer': return {tag: TypeTag.INTEGER};
    case 'long': return {tag: TypeTag.LONG};
    case 'any': return {tag: TypeTag.ANY};
  }
  throw new Error("Invalid type name");
}

export function typeOfDefType(keyword: string): Type {
  switch (keyword.toLowerCase()) {
    case 'defsng': return {tag: TypeTag.SINGLE};
    case 'defdbl': return {tag: TypeTag.DOUBLE};
    case 'defstr': return {tag: TypeTag.STRING};
    case 'defint': return {tag: TypeTag.INTEGER};
    case 'deflng': return {tag: TypeTag.LONG};
  }
  throw new Error("Invalid keyword");
}

export function splitSigil(text: string): [string, string] {
  const lastChar = text.slice(-1);
  if ("!#$%&".includes(lastChar)) {
    return [text.slice(0, -1), lastChar];
  }
  return [text, ""];
}
