import {
  UnaryMinusExprContext,
  ValueExprContext,
  NotExprContext,
} from "../build/QBasicParser.ts";
import { QBasicParserListener } from "../build/QBasicParserListener.ts";
import { ParserRuleContext } from "antlr4ng";
import * as values from "./Values.ts";
import { QBasicType } from "./Types.ts";

export class ExpressionListener extends QBasicParserListener {
  stack: values.Value[] = [];

  constructor() {
    super();
  }

  getResult() {
    return this.pop();
  }

  private push(v: values.Value) {
    this.stack.push(v);
  }

  private pop(): values.Value {
    if (this.stack.length == 0) {
      throw new Error('stack underflow while evaluating expression');
    }
    return this.stack.pop()!;
  }

  binaryOperator = (ctx: ParserRuleContext) => {
    const op = ctx.getChild(1)!.getText();
    const b = this.pop();
    const a = this.pop();
    if (values.isNumeric(a) && values.isNumeric(b)) {
      this.push(evaluateNumericBinaryOperator(op, a, b));
    } else if (values.isString(a) && values.isString(b)) {
      this.push(evaluateStringBinaryOperator(op, a, b));
    // Propagate errors from earlier during evaluation.
    // TODO: Record the first error, and reset it on statement boundaries.
    } else if (values.isError(a)) {
      this.push(a);
    } else if (values.isError(b)) {
      this.push(b);
    } else {
      this.push(values.TYPE_MISMATCH);
    }
  }

  // Skip parens.
  override exitExponentExpr = this.binaryOperator;
  // Skip unary plus.
  override exitUnaryMinusExpr = (_ctx: UnaryMinusExprContext) => {
    const a = this.pop();
    if (!values.isNumeric(a)) {
      this.push(values.TYPE_MISMATCH);
      return;
    }
    // Note that k%=-32768:print -k% will overflow.
    this.push(values.numericTypeOf(a)(-a.number));
  }

  override exitMultiplyDivideExpr = this.binaryOperator;
  override exitIntegerDivideExpr = this.binaryOperator;
  override exitModExpr = this.binaryOperator;
  override exitPlusMinusExpr = this.binaryOperator;
  override exitComparisonExpr = this.binaryOperator;

  override exitNotExpr = (_ctx: NotExprContext) => {
    const a = this.pop();
    if (!values.isNumeric(a)) {
      this.push(values.TYPE_MISMATCH);
      return;
    }
    if (a.qbasicType == QBasicType.INTEGER) {
      this.push(values.integer(~a.number));
      return;
    }
    if (a.qbasicType == QBasicType.LONG) {
      this.push(values.long(~a.number));
      return;
    }
    // Cast a to long first to detect overflow.
    const _ = values.long(a.number);
    this.push(values.long(~a.number));
  }

  override exitAndExpr = this.binaryOperator;
  override exitOrExpr = this.binaryOperator;
  override exitXorExpr = this.binaryOperator;
  override exitEqvExpr = this.binaryOperator;
  override exitImpExpr = this.binaryOperator;

  override exitValueExpr = (ctx: ValueExprContext) => {
    this.push(this.parseValue(ctx.getText()));
  }

  parseValue(fullText: string): values.Value {
    const [text, sigil] = stripSigil(fullText);
    if (text.startsWith('"') && text.endsWith('"')) {
      return values.string(text.substring(1, text.length - 1));
    }
    if (text.toLowerCase().startsWith('&h')) {
      return parseAmpConstant(text, 16, sigil);
    }
    if (text.toLowerCase().startsWith('&o')) {
      return parseAmpConstant(text, 8, sigil);
    }
    if (/^[0-9]+$/.test(text)) {
      return parseIntegerConstant(text, sigil);
    }
    return parseFloatConstant(text, sigil);
  }
}

function parseFloatConstant(text: string, sigil: string): values.Value {
  const n = parseFloat(text.toLowerCase().replace('d', 'e'));
  if (!isFinite(n)) {
    return values.OVERFLOW;
  }
  const hasDoubleExponent = text.toLowerCase().includes('d');
  if (sigil == '#' || hasDoubleExponent) {
    return values.double(n);
  }
  const [, intPart, fracPart] = text.match(/^([0-9]*)\.?([0-9]*)/)!;
  if (intPart.length + fracPart.length > 7) {
    return values.double(n);
  }
  return values.single(n);
}

function parseIntegerConstant(text: string, sigil: string): values.Value {
  const n = parseInt(text, 10);
  switch (sigil) {
    case '#':
      return values.double(n);
    case '!':
      return values.single(n);
    case '%':
      return n > 0x7fff ? values.ILLEGAL_NUMBER : values.integer(n);
    case '&':
      return n > 0x7fffffff ? values.ILLEGAL_NUMBER : values.long(n);
    default:
      return (n > 0x7fffffff) ? values.double(n) :
             (n > 0x7fff) ? values.long(n) :
             values.integer(n);
  }
}

function parseAmpConstant(text: string, base: number, sigil: string): values.Value {
  const n = parseInt(text.substring(2), base);
  if (n > 0xffffffff) {
    return values.OVERFLOW;
  }
  if (sigil == '%') {
    return n > 0xffff ? values.OVERFLOW : values.integer(n);
  }
  if (sigil == '&') {
    return values.long(n);
  }
  return n > 0xffff ? values.long(n) : values.integer(n);
}

function stripSigil(text: string): [prefix: string, suffix: string] {
  const [, prefix, sigil] = text.match(/(.*?)([$%&!#]?$)/)!;
  return [prefix, sigil];
}

function evaluateNumericBinaryOperator(op: string, a: values.NumericValue, b: values.NumericValue): values.Value {
  const resultType = values.mostPreciseType(a, b);
  switch (op.toLowerCase()) {
    case '+':
      return resultType(a.number + b.number);
    case '-':
      return resultType(a.number - b.number);
    case '*':
      return resultType(a.number * b.number);
    case '/':
      return b.number == 0 ? values.DIVISION_BY_ZERO : resultType(a.number / b.number);
    case '\\':
      return withIntegerCast(a, b, integerDivide);
    case 'mod':
      return withIntegerCast(a, b, integerRemainder);
    case '^':
      if (a.number == 0 && b.number < 0) {
        return values.ILLEGAL_FUNCTION_CALL;
      }
      return resultType(Math.pow(a.number, b.number));
    case '=':
      return values.boolean(a.number == b.number);
    case '<':
      return values.boolean(a.number < b.number);
    case '<=':
      return values.boolean(a.number <= b.number);
    case '<>':
      return values.boolean(a.number != b.number);
    case '>=':
      return values.boolean(a.number >= b.number);
    case '>':
      return values.boolean(a.number > b.number);
    case 'and':
      return logicalOp(a, b, (a, b) => a & b);
    case 'or':
      return logicalOp(a, b, (a, b) => a | b);
    case 'xor':
      return logicalOp(a, b, (a, b) => a ^ b);
    case 'eqv':
      return logicalOp(a, b, (a, b) => ~(a ^ b));
    case 'imp':
      return logicalOp(a, b, (a, b) => ~a | b);
    default:
      throw new Error(`Unknown operator ${op}`);
  }
}

function evaluateStringBinaryOperator(op: string, a: values.StringValue, b: values.StringValue): values.Value {
  switch (op.toLowerCase()) {
    case '+':
      return values.string(a.string + b.string);
    case '=':
      return values.boolean(a.string == b.string);
    case '<':
      return values.boolean(a.string < b.string);
    case '<=':
      return values.boolean(a.string <= b.string);
    case '<>':
      return values.boolean(a.string != b.string);
    case '>=':
      return values.boolean(a.string >= b.string);
    case '>':
      return values.boolean(a.string > b.string);
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
     return values.TYPE_MISMATCH;
    default:
      throw new Error(`Unknown operator ${op}`);
  }
}

function withIntegerCast(a: values.NumericValue, b: values.NumericValue, fn: (a: values.NumericValue, b: values.NumericValue) => values.Value): values.Value {
  const bothOperandsAreShortIntegers =
    a.qbasicType == QBasicType.INTEGER && b.qbasicType == QBasicType.INTEGER;
  const integerType = bothOperandsAreShortIntegers ? values.integer : values.long;
  const castA = integerType(Math.round(a.number));
  const castB = integerType(Math.round(b.number));
  if (!values.isNumeric(castA)) {
    return castA;
  }
  if (!values.isNumeric(castB)) {
    return castB;
  }
  return fn(castA, castB);
}

function integerDivide(a: values.NumericValue, b: values.NumericValue): values.Value {
  if (b.number == 0) {
    return values.DIVISION_BY_ZERO;
  }
  return values.numericTypeOf(a)(Math.floor(a.number / b.number));
}

function integerRemainder(a: values.NumericValue, b: values.NumericValue): values.Value {
  if (b.number == 0) {
    return values.DIVISION_BY_ZERO;
  }
  return values.numericTypeOf(a)(a.number % b.number);
}

function logicalOp(a: values.NumericValue, b: values.NumericValue, op: (a: number, b: number) => number): values.Value {
  return withIntegerCast(a, b, (a, b) => values.numericTypeOf(a)(op(a.number, b.number)));
}