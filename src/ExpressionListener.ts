import {
  UnaryMinusExprContext,
  ValueExprContext,
  NotExprContext,
} from "../build/QBasicParser.ts";
import { QBasicParserListener } from "../build/QBasicParserListener.ts";
import { ParserRuleContext } from "antlr4ng";
import * as values from "./Values.ts";

export class ExpressionListener extends QBasicParserListener {
  stack: values.Value[] = [];

  constructor() {
    super();
  }

  public getResult() {
    return this.pop();
  }

  push(v: values.Value) {
    this.stack.push(v);
  }

  pop(): values.Value {
    if (this.stack.length == 0) {
      throw new Error('stack underflow while evaluating expression');
    }
    return this.stack.pop()!;
  }

  override exitUnaryMinusExpr = (_ctx: UnaryMinusExprContext) => {
    const a = this.pop();
    if (a.qbasicType != values.QBasicType.SINGLE) {
      this.push(values.makeError('Type mismatch'));
    } else {
      this.push(values.makeSingle(-a.data));
    }
  }

  override exitNotExpr = (_ctx: NotExprContext) => {
    const a = this.pop()!;
    if (a.qbasicType != values.QBasicType.SINGLE) {
      this.push(values.makeError('Type mismatch'));
    } else {
      this.push(values.makeSingle(~Math.round(a.data)));
    }
  }

  binaryOperator = (ctx: ParserRuleContext) => {
    const op = ctx.getChild(1)!.getText();
    const b = this.pop();
    const a = this.pop();
    if (a.qbasicType == values.QBasicType.SINGLE &&
        b.qbasicType == values.QBasicType.SINGLE) {
      this.push(values.makeSingle(evaluateNumericBinaryOperator(op, a.data, b.data)));
    } else if (a.qbasicType == values.QBasicType.STRING &&
               b.qbasicType == values.QBasicType.STRING) {
      this.push(evaluateStringBinaryOperator(op, a.data, b.data));
    } else {
      this.push(values.makeError('Type mismatch'));
    }
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
    const text: string = ctx.getText();
    if (text.startsWith('"') && text.endsWith('"')) {
      this.push(values.makeString(text.substring(1, text.length - 1)));
      return;
    }
    // TODO: parse hex and octal, deal with sigils
    this.push(values.makeSingle(+text));
  }
}

function evaluateNumericBinaryOperator(op: string, a: number, b: number): number {
  switch (op.toLowerCase()) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
    case '\\': return Math.floor(a / b);
    case 'mod': return a % b;
    case '^': return Math.pow(a, b);
    case '=': return a == b ? values.TRUE : values.FALSE;
    case '<': return a < b ? values.TRUE: values.FALSE;
    case '<=': return a <= b ? values.TRUE: values.FALSE;
    case '<>': return a != b ? values.TRUE : values.FALSE;
    case '>=': return a >= b ? values.TRUE : values.FALSE;
    case '>': return a > b ? values.TRUE : values.FALSE;
    case 'and': return Math.round(a) & Math.round(b);
    case 'or': return Math.round(a) | Math.round(b);
    case 'xor': return Math.round(a) ^ Math.round(b);
    case 'eqv': return ~(Math.round(a) ^ Math.round(b));
    case 'imp': return ~Math.round(a) | Math.round(b);
    default: throw new Error(`Unknown operator {op}`);
  }
}

function evaluateStringBinaryOperator(op: string, a: string, b: string): values.Value {
  switch (op.toLowerCase()) {
    case '+': return values.makeString(a + b);
    case '=': return values.makeSingle(a == b ? values.TRUE : values.FALSE);
    case '<': return values.makeSingle(a < b ? values.TRUE : values.FALSE);
    case '<=': return values.makeSingle(a <= b ? values.TRUE : values.FALSE);
    case '<>': return values.makeSingle(a != b ? values.TRUE : values.FALSE);
    case '>=': return values.makeSingle(a >= b ? values.TRUE : values.FALSE);
    case '>': return values.makeSingle(a > b ? values.TRUE : values.FALSE);
    case '-':
    case '*':
    case '/':
    case '\\':
    case 'mod':
    case '^':
    case 'and':
    case 'or':
    case 'xor':
    case 'eqv':
    case 'imp':
     return values.makeError('Type mismatch');
    default: throw new Error(`Unknown operator {op}`);
  }
}