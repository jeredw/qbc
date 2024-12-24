import {ParserRuleContext} from "antlr4ng"

/** Semantic errors detected at parse time. */
export class ParseError extends Error {
  parseContext: ParserRuleContext;

  constructor(parseContext: ParserRuleContext, message: string, ...params: any[]) {
    super(...params);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ParseError);
    }
    this.name = "ParseError";
    this.parseContext = parseContext;
    this.message = message;
  }

  get location() {
    const start = this.parseContext.start!;
    const line = start.line;
    const column = start.column;
    const length = start.text?.length;
    return {line, column, length};
  }
}