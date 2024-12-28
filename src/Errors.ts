import { Token } from "antlr4ng"

/** Semantic errors detected at parse time. */
export class ParseError extends Error {
  offendingSymbol: Token | null;
  line: number;
  charPositionInLine: number;
  length: number;

  constructor(offendingSymbol: Token | null, line: number, charPositionInLine: number, length: number, message: string, ...params: any[]) {
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