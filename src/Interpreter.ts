import { QBasicLexer } from "../build/QBasicLexer.ts";
import {
  QBasicParser,
  UnaryMinusExprContext,
  ValueExprContext,
  NotExprContext,
} from "../build/QBasicParser.ts";
import { QBasicParserListener } from "../build/QBasicParserListener.ts";
import {
  CharStream,
  CommonTokenStream,
  ParserRuleContext
} from "antlr4ng";

const TRUE_VALUE = -1;
const FALSE_VALUE = 0;

export class Interpreter extends QBasicParserListener {
  expressionListener : ExpressionListener = new ExpressionListener();

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

class ExpressionListener extends QBasicParserListener {
  stack: number[] = [];

  constructor() {
    super();
  }

  public getResult() {
    return this.pop();
  }

  push(value: number) {
    this.stack.push(value);
  }

  pop(): number {
    if (this.stack.length == 0) {
      throw new Error('stack underflow while evaluating expression');
    }
    return this.stack.pop()!;
  }

  override exitUnaryMinusExpr = (_ctx: UnaryMinusExprContext) => {
    const a = this.pop();
    this.push(-a);
  }

  override exitNotExpr = (_ctx: NotExprContext) => {
    const a = this.pop()!;
    this.push(~Math.round(a));
  }

  binaryOperator = (ctx: ParserRuleContext) => {
    const op = ctx.getChild(1)!.getText();
    const b = this.pop();
    const a = this.pop();
    this.stack.push(evaluateBinaryOperator(op, a, b));
  }

  override exitPlusMinusExpr = this.binaryOperator;
  override exitMultiplyDivideExpr = this.binaryOperator;
  override exitExponentExpr = this.binaryOperator;
  override exitModExpr = this.binaryOperator;
  override exitComparisonExpr = this.binaryOperator;
  override exitAndExpr = this.binaryOperator;
  override exitOrExpr = this.binaryOperator;
  override exitXorExpr = this.binaryOperator;
  override exitEqvExpr = this.binaryOperator;
  override exitImpExpr = this.binaryOperator;

  override exitValueExpr = (ctx: ValueExprContext) => {
    const value: string = ctx.getText();
    /*if (value.startsWith('"') && value.endsWith('"')) {
      this.push(value.substring(1, value.length - 1));
      return;
    }*/
    // TODO: parse hex and octal, deal with sigils
    this.push(+value);
  }
}

function evaluateBinaryOperator(op: string, a: number, b: number): number {
  switch (op.toLowerCase()) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
    case '\\': return Math.floor(a / b);
    case 'mod': return a % b;
    case '^': return Math.pow(a, b);
    case '=': return a == b ? TRUE_VALUE : FALSE_VALUE;
    case '<': return a < b ? TRUE_VALUE : FALSE_VALUE;
    case '<=': return a <= b ? TRUE_VALUE : FALSE_VALUE;
    case '<>': return a != b ? TRUE_VALUE : FALSE_VALUE;
    case '>=': return a >= b ? TRUE_VALUE : FALSE_VALUE;
    case '>': return a > b ? TRUE_VALUE : FALSE_VALUE;
    case 'and': return Math.round(a) & Math.round(b);
    case 'or': return Math.round(a) | Math.round(b);
    case 'xor': return Math.round(a) ^ Math.round(b);
    case 'eqv': return ~(Math.round(a) ^ Math.round(b));
    case 'imp': return ~Math.round(a) | Math.round(b);
    default: throw new Error(`Unknown operator {op}`);
  }
}