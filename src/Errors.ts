import { Token } from "antlr4ng"

/** Semantic errors detected at parse time. */
export class ParseError extends Error {
  offendingSymbol: Token;

  constructor(offendingSymbol: Token, message: string, ...params: any[]) {
    super(...params);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ParseError);
    }
    this.name = "ParseError";
    this.offendingSymbol = offendingSymbol;
    this.message = message;
  }

  get location() {
    return {
      line: this.offendingSymbol.line,
      column: this.offendingSymbol.column,
      length: this.offendingSymbol.text?.length
    };
  }
}