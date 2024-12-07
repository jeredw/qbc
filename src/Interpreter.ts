import { QBasicLexer } from "../build/QBasicLexer.ts";
import { QBasicParser } from "../build/QBasicParser.ts";
import { QBasicParserListener } from "../build/QBasicParserListener.ts";
import { ExpressionListener } from "./ExpressionListener.ts";
import {
  CharStream,
  CommonTokenStream,
} from "antlr4ng";

export class Interpreter extends QBasicParserListener {
  expressionListener = new ExpressionListener();

  constructor() {
    super();
  }

  public run(text: string) {
    const textWithNewline = text.endsWith('\n') ? text : text + '\n';
    const inputStream = CharStream.fromString(textWithNewline);
    const lexer = new QBasicLexer(inputStream);
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new QBasicParser(tokenStream);
    parser.addParseListener(this);
    parser.addParseListener(this.expressionListener);
    parser.program();
  }

  override exitPrint_statement = (ctx: Print_statementContext) => {
    console.log(this.expressionListener.getResult());
  }
}