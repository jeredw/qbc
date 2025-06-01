import { Token } from "antlr4ng"
import { ErrorValue, error } from "./Values.ts";

/** Semantic errors detected at parse time. */
export class ParseError extends Error {
  offendingSymbol: Token | null;
  line: number;
  charPositionInLine: number;
  length: number;

  private constructor(offendingSymbol: Token | null, line: number, charPositionInLine: number, length: number, message: string, ...params: any[]) {
    super(...params);
    if (Error['captureStackTrace']) {
      Error['captureStackTrace'](this, ParseError);
    }
    this.name = "ParseError";
    this.offendingSymbol = offendingSymbol;
    this.line = line;
    this.charPositionInLine = charPositionInLine;
    this.length = length;
    this.message = message;
  }

  static fromToken(offendingSymbol: Token, message: string) {
    return new ParseError(
      offendingSymbol,
      offendingSymbol.line,
      offendingSymbol.column,
      offendingSymbol.text?.length ?? 1,
      message);
  }

  static fromLineAndPosition(line: number, charPositionInLine: number, message: string) {
    return new ParseError(
      null,
      line,
      charPositionInLine,
      1,
      message);
  }

  get location() {
    return {
      line: this.line,
      column: this.charPositionInLine,
      length: this.length,
    };
  }
}

export class RuntimeError extends Error {
  error: ErrorValue;
  offendingSymbol: Token | null;
  line: number;
  charPositionInLine: number;
  length: number;

  private constructor(error: ErrorValue, offendingSymbol: Token | null, line: number, charPositionInLine: number, length: number, ...params: any[]) {
    super(...params);
    if (Error['captureStackTrace']) {
      Error['captureStackTrace'](this, ParseError);
    }
    this.name = "RuntimeError";
    this.error = error;
    this.offendingSymbol = offendingSymbol;
    this.line = line;
    this.charPositionInLine = charPositionInLine;
    this.length = length;
    this.message = error.errorMessage;
  }

  static fromToken(offendingSymbol: Token, error: ErrorValue) {
    return new RuntimeError(
      error,
      offendingSymbol,
      offendingSymbol.line,
      offendingSymbol.column,
      offendingSymbol.text?.length ?? 1);
  }

  get location() {
    return {
      line: this.line,
      column: this.charPositionInLine,
      length: this.length,
    };
  }
}

export class IOError extends Error {
  error: ErrorValue;

  constructor(error: ErrorValue) {
    super(error.errorMessage);
    this.error = error;
  }
}

export const
  OVERFLOW = error('Overflow'),
  ILLEGAL_NUMBER = error('Illegal number'),
  TYPE_MISMATCH = error('Type mismatch'),
  DIVISION_BY_ZERO = error('Division by zero'),
  ILLEGAL_FUNCTION_CALL = error('Illegal function call'),
  RETURN_WITHOUT_GOSUB = error('RETURN without GOSUB'),
  SUBSCRIPT_OUT_OF_RANGE = error('Subscript out of range'),
  DUPLICATE_DEFINITION = error('Duplicate definition'),
  OUT_OF_DATA = error('Out of DATA'),
  SYNTAX_ERROR = error('Syntax error'),
  BAD_FILE_NAME_OR_NUMBER = error('Bad file name or number'),
  BAD_FILE_MODE = error('Bad file mode'),
  INPUT_PAST_END_OF_FILE = error('Input past end of file'),
  PATH_NOT_FOUND = error('Path not found'),
  PATH_FILE_ACCESS_ERROR = error('Path/File access error'),
  FILE_NOT_FOUND = error('File not found'),
  FILE_ALREADY_OPEN = error('File already open'),
  BAD_RECORD_NUMBER = error('Bad record number'),
  FIELD_OVERFLOW = error('FIELD overflow'),
  FILE_ALREADY_EXISTS = error('File already exists'),
  FIELD_STATEMENT_ACTIVE = error('FIELD statement active'),
  BAD_RECORD_LENGTH = error('Bad record length'),
  VARIABLE_REQUIRED = error('Variable required'),
  OUT_OF_STACK_SPACE = error('Out of stack space');