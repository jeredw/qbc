import { QBasicLexer } from "../build/QBasicLexer.ts";
import { PlusMinusExprContext, Print_statementContext } from "../build/QBasicParser.js";
import { QBasicParser } from "../build/QBasicParser.ts";
import { QBasicParserListener } from "../build/QBasicParserListener.ts";
import {
  CharStream,
  CommonTokenStream,
} from "antlr4ng";

export class Interpreter extends QBasicParserListener {
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
    parser.program();
  }

  exprStack = [];

  override exitPrint_statement = (ctx: Print_statementContext) => {
    console.log(this.exprStack.pop());
  }

  override exitPlusMinusExpr = (ctx: PlusMinusExprContext) => {
    const a = this.exprStack.pop();
    const op = ctx.getChild(1).getText()
    const b = this.exprStack.pop();
    this.exprStack.push(op == '+' ? a + b : a - b);
  }

  override exitValueExpr = (ctx: ValueExprContext) => {
    const value: string = ctx.getText();
    if (value.startsWith('"') && value.endsWith('"')) {
      this.exprStack.push(value.substring(1, value.length - 1));
      return;
    }
    // TODO: parse hex and octal, deal with sigils
    this.exprStack.push(+value);
  }
}