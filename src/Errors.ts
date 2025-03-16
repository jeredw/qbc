import { Token } from "antlr4ng"
import { ErrorValue } from "./Values.ts";

/** Semantic errors detected at parse time. */
export class ParseError extends Error {
  offendingSymbol: Token | null;
  line: number;
  charPositionInLine: number;
  length: number;

  private constructor(offendingSymbol: Token | null, line: number, charPositionInLine: number, length: number, message: string, ...params: any[]) {
    super(...params);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ParseError);
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
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ParseError);
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