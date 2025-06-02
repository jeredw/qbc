import { Token } from "antlr4ng"
import { ErrorValue, error } from "./Values.ts";

export interface ErrorHandling {
  // True if currently handling an error.
  active?: boolean;
  // If set, statement index for the current error handler.
  // Assumed to be in program chunk 0.
  targetIndex?: number;
  // Used to issue a "No RESUME" error for missing RESUME statements.
  token?: Token;
  // The most recent error.
  error?: ErrorValue;
  // The most recent line number with an error.
  errorLine?: number;
  // The chunk with an error.
  chunkIndex?: number;
  // The statement with an error.
  statementIndex?: number;
}

// Semantic errors detected at parse time
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

// Trappable runtime errors.
export const
  SYNTAX_ERROR = error(2, 'Syntax error'),
  RETURN_WITHOUT_GOSUB = error(3, 'RETURN without GOSUB'),
  OUT_OF_DATA = error(4, 'Out of DATA'),
  ILLEGAL_FUNCTION_CALL = error(5, 'Illegal function call'),
  OVERFLOW = error(6, 'Overflow'),
  SUBSCRIPT_OUT_OF_RANGE = error(9, 'Subscript out of range'),
  DUPLICATE_DEFINITION = error(10, 'Duplicate definition'),
  DIVISION_BY_ZERO = error(11, 'Division by zero'),
  TYPE_MISMATCH = error(13, 'Type mismatch'),
  NO_RESUME = error(19, 'No RESUME'),
  RESUME_WITHOUT_ERROR = error(20, 'RESUME without error'),
  VARIABLE_REQUIRED = error(40, 'Variable required'),
  FIELD_OVERFLOW = error(50, 'FIELD overflow'),
  BAD_FILE_NAME_OR_NUMBER = error(52, 'Bad file name or number'),
  FILE_NOT_FOUND = error(53, 'File not found'),
  BAD_FILE_MODE = error(54, 'Bad file mode'),
  FILE_ALREADY_OPEN = error(55, 'File already open'),
  FIELD_STATEMENT_ACTIVE = error(56, 'FIELD statement active'),
  FILE_ALREADY_EXISTS = error(58, 'File already exists'),
  BAD_RECORD_LENGTH = error(59, 'Bad record length'),
  INPUT_PAST_END_OF_FILE = error(62, 'Input past end of file'),
  BAD_RECORD_NUMBER = error(63, 'Bad record number'),
  PATH_FILE_ACCESS_ERROR = error(75, 'Path/File access error'),
  PATH_NOT_FOUND = error(76, 'Path not found');

// Untrappable or parser errors.
export const
  ILLEGAL_NUMBER = error(-1, 'Illegal number'),
  OUT_OF_STACK_SPACE = error(-1, 'Out of stack space');