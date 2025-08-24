import { Token } from "antlr4ng"
import { ErrorValue, error } from "./Values.ts";
import { TypeTag } from "./Types.ts";

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
  // The most recent line number.
  lineNumber?: number;
  // The most recent line number before the most recent error.
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

  static internalError(token: Token | null, thrownError: unknown) {
    return new ParseError(
      token,
      token?.line ?? 1,
      token?.column ?? 0,
      token?.text?.length ?? 1,
      internalErrorMessage(thrownError));
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
      Error['captureStackTrace'](this, RuntimeError);
    }
    this.name = "RuntimeError";
    this.error = error;
    this.offendingSymbol = offendingSymbol;
    this.line = line;
    this.charPositionInLine = charPositionInLine;
    this.length = length;
    this.message = error.errorMessage;
  }

  static internalError(lineNumber: number, thrownError: unknown) {
    const error: ErrorValue = {
      tag: TypeTag.ERROR,
      errorCode: INTERNAL_ERROR.errorCode,
      errorMessage: internalErrorMessage(thrownError),
    };
    return new RuntimeError(error, null, lineNumber, 0, 1);
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

function internalErrorMessage(e: unknown): string {
  return `Internal error\n${(e as Error).stack}`;
}

// Builtin error messages that can be returned by ERROR.
const ERROR_MESSAGES: Map<number, string> = (() => {
  const chart = `
1       NEXT without FOR             38      Array not defined
2       Syntax error                 39      CASE ELSE expected
3       RETURN without GOSUB         40      Variable required
4       Out of DATA                  50      FIELD overflow
5       Illegal function call        51      Internal error
6       Overflow                     52      Bad file name or number
7       Out of memory                53      File not found
8       Label not defined            54      Bad file mode
9       Subscript out of range       55      File already open
10      Duplicate definition         56      FIELD statement active
11      Division by zero             57      Device I/O error
12      Illegal in direct mode       58      File already exists
13      Type mismatch                59      Bad record length
14      Out of string space          61      Disk full
16      String formula too complex   62      Input past end of file
17      Cannot continue              63      Bad record number
18      Function not defined         64      Bad file name
19      No RESUME                    67      Too many files
20      RESUME without error         68      Device unavailable
24      Device timeout               69      Communication-buffer overflow
25      Device fault                 70      Permission denied
26      FOR without NEXT             71      Disk not ready
27      Out of paper                 72      Disk-media error
29      WHILE without WEND           73      Advanced feature unavailable
30      WEND without WHILE           74      Rename across disks
33      Duplicate label              75      Path/File access error
35      Subprogram not defined       76      Path not found
37      Argument-count mismatch
`;
  const errors = new Map<number, string>();
  for (const line of chart.split('\n')) {
    const entries = line.match(/(\d+)\s+([^\d]+)/g) ?? [];
    for (const entry of entries) {
      const [_, code, message] = entry.trim().match(/(\d+)\s+(.*)/)!;
      if (+code && message) {
        errors.set(+code, message);
      }
    }
  }
  return errors;
})();

export function getErrorForCode(code: number): ErrorValue {
  return error(code, ERROR_MESSAGES.get(code) ?? "Unprintable error");
}

// Trappable runtime errors.
export const
  SYNTAX_ERROR = getErrorForCode(2),
  RETURN_WITHOUT_GOSUB = getErrorForCode(3),
  OUT_OF_DATA = getErrorForCode(4),
  ILLEGAL_FUNCTION_CALL = getErrorForCode(5),
  OVERFLOW = getErrorForCode(6),
  OUT_OF_MEMORY = getErrorForCode(7),
  SUBSCRIPT_OUT_OF_RANGE = getErrorForCode(9),
  DUPLICATE_DEFINITION = getErrorForCode(10),
  DIVISION_BY_ZERO = getErrorForCode(11),
  TYPE_MISMATCH = getErrorForCode(13),
  NO_RESUME = getErrorForCode(19),
  RESUME_WITHOUT_ERROR = getErrorForCode(20),
  VARIABLE_REQUIRED = getErrorForCode(40),
  FIELD_OVERFLOW = getErrorForCode(50),
  INTERNAL_ERROR = getErrorForCode(51),
  BAD_FILE_NAME_OR_NUMBER = getErrorForCode(52),
  FILE_NOT_FOUND = getErrorForCode(53),
  BAD_FILE_MODE = getErrorForCode(54),
  FILE_ALREADY_OPEN = getErrorForCode(55),
  FIELD_STATEMENT_ACTIVE = getErrorForCode(56),
  FILE_ALREADY_EXISTS = getErrorForCode(58),
  BAD_RECORD_LENGTH = getErrorForCode(59),
  INPUT_PAST_END_OF_FILE = getErrorForCode(62),
  BAD_RECORD_NUMBER = getErrorForCode(63),
  BAD_FILE_NAME = getErrorForCode(64),
  ADVANCED_FEATURE_UNAVAILABLE = getErrorForCode(73),
  PATH_FILE_ACCESS_ERROR = getErrorForCode(75),
  PATH_NOT_FOUND = getErrorForCode(76);

// Untrappable or parser errors.
export const
  ILLEGAL_NUMBER = error(-1, "Illegal number"),
  OUT_OF_STACK_SPACE = error(-1, "Out of stack space");