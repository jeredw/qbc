import {
  ExprContext,
  ExponentExprContext,
  NotExprContext,
  UnaryMinusExprContext,
  ValueExprContext,
  VarCallExprContext,
} from "../build/QBasicParser.ts";
import { QBasicParserListener } from "../build/QBasicParserListener.ts";
import { ParserRuleContext, ParseTreeWalker } from "antlr4ng";
import * as values from "./Values.ts";
import { splitSigil, Type, TypeTag } from "./Types.ts";
import { ParseError } from "./Errors.ts";
import { isConstant, isVariable } from "./SymbolTable.ts";
import { Memory } from "./Memory.ts";
import { Variable } from "./Variables.ts";

export function typeCheckExpression({
  expr,
  constantExpression,
  resultType,
}: {
  expr: ExprContext,
  constantExpression?: boolean,
  resultType?: Type,
}): values.Value {
  const expressionListener = new ExpressionListener(!!constantExpression);
  ParseTreeWalker.DEFAULT.walk(expressionListener, expr);
  const result = expressionListener.getResult();
  return resultType ? values.cast(result, resultType) : result;
}

export function evaluateExpression({
  expr,
  constantExpression,
  resultType,
  memory,
}: {
  expr: ExprContext,
  constantExpression?: boolean,
  resultType?: Type,
  memory: Memory,
}): values.Value {
  const expressionListener = new ExpressionListener(!!constantExpression, memory);
  ParseTreeWalker.DEFAULT.walk(expressionListener, expr);
  const result = expressionListener.getResult();
  return resultType ? values.cast(result, resultType) : result;
}

class ExpressionListener extends QBasicParserListener {
  private _stack: values.Value[] = [];
  private _constantExpression: boolean;
  private _callExpressionDepth: number;
  private _typeCheck: boolean;
  private _memory?: Memory;

  constructor(constantExpression: boolean, memory?: Memory) {
    super();
    this._constantExpression = constantExpression;
    this._callExpressionDepth = 0;
    this._typeCheck = !memory;
    this._memory = memory;
  }

  getResult() {
    return this.pop();
  }

  private push(v: values.Value) {
    this._stack.push(v);
  }

  private pop(): values.Value {
    if (this._stack.length == 0) {
      throw new Error('stack underflow while evaluating expression');
    }
    return this._stack.pop()!;
  }

  private binaryOperator = (ctx: ParserRuleContext) => {
    if (this._callExpressionDepth > 0) {
      return;
    }
    const op = ctx.getChild(1)!.getText();
    const b = this.pop();
    const a = this.pop();
    if (values.isNumeric(a) && values.isNumeric(b)) {
      this.push(this.evaluateNumericBinaryOperator(op, a, b));
    } else if (values.isString(a) && values.isString(b)) {
      if (this._constantExpression && op == '+') {
        throw ParseError.fromToken(ctx.start!, "Illegal function call");
      }
      this.push(this.evaluateStringBinaryOperator(op, a, b));
    // Propagate errors from earlier during evaluation.
    } else if (values.isError(a)) {
      this.push(a);
    } else if (values.isError(b)) {
      this.push(b);
    } else {
      this.push(values.TYPE_MISMATCH);
    }
  }

  // Skip parens.

  override exitExponentExpr = (ctx: ExponentExprContext) => {
    if (this._callExpressionDepth > 0) {
      return;
    }
    if (this._constantExpression) {
      throw ParseError.fromToken(ctx.EXP().symbol, "Illegal function call");
    }
    this.binaryOperator(ctx);
  }

  // Skip unary plus.

  override exitUnaryMinusExpr = (_ctx: UnaryMinusExprContext) => {
    if (this._callExpressionDepth > 0) {
      return;
    }
    const a = this.pop();
    if (!values.isNumeric(a)) {
      this.push(values.TYPE_MISMATCH);
      return;
    }
    // Note that k%=-32768:print -k% will overflow.
    this.push(values.numericTypeOf(a)(this.check(-a.number)));
  }

  override exitMultiplyDivideExpr = this.binaryOperator;
  override exitIntegerDivideExpr = this.binaryOperator;
  override exitModExpr = this.binaryOperator;
  override exitPlusMinusExpr = this.binaryOperator;
  override exitComparisonExpr = this.binaryOperator;

  override exitNotExpr = (_ctx: NotExprContext) => {
    if (this._callExpressionDepth > 0) {
      return;
    }
    const a = this.pop();
    if (!values.isNumeric(a)) {
      this.push(values.TYPE_MISMATCH);
      return;
    }
    if (a.tag == TypeTag.INTEGER) {
      this.push(values.integer(this.check(~a.number)));
      return;
    }
    if (a.tag == TypeTag.LONG) {
      this.push(values.long(this.check(~a.number)));
      return;
    }
    // Cast a to long first to detect overflow.
    const _ = values.long(this.check(a.number));
    this.push(values.long(this.check(~a.number)));
  }

  override exitAndExpr = this.binaryOperator;
  override exitOrExpr = this.binaryOperator;
  override exitXorExpr = this.binaryOperator;
  override exitEqvExpr = this.binaryOperator;
  override exitImpExpr = this.binaryOperator;

  override exitValueExpr = (ctx: ValueExprContext) => {
    if (this._callExpressionDepth > 0) {
      return;
    }
    this.push(parseLiteral(ctx.getText()));
  }

  override enterVarCallExpr = (dispatchCtx: VarCallExprContext) => {
    this._callExpressionDepth++;
    if (this._callExpressionDepth > 1) {
      // Do not recurse into argument expressions.  Those are evaluated separately.
      return;
    }
    const ctx = dispatchCtx.variable_or_function_call();
    const result = ctx['$result'];
    if (result) {
      this.push(this.readVariable(result));
      return;
    }
    const symbol = ctx['$symbol'];
    if (!symbol) {
      throw new Error("missing symbol");
    }
    if (this._constantExpression) {
      if (!isConstant(symbol)) {
        throw ParseError.fromToken(ctx.start!, "Invalid constant");
      }
    }
    if (isConstant(symbol)) {
      this.push(symbol.constant.value);
      return;
    }
    if (isVariable(symbol)) {
      this.push(this.readVariable(symbol.variable));
      return;
    }
    throw new Error("missing result for function call");
  }

  private readVariable(variable: Variable): values.Value {
    if (variable.type.tag == TypeTag.RECORD) {
      return values.getDefaultValue(variable);
    }
    if (this._memory) {
      const [_, value] = this._memory.dereference(variable);
      if (value) {
        return value;
      }
    }
    return values.getDefaultValue(variable);
  }

  override exitVarCallExpr = (_ctx: VarCallExprContext) => {
    this._callExpressionDepth--;
  }

  private evaluateNumericBinaryOperator(op: string, a: values.NumericValue, b: values.NumericValue): values.Value {
    const resultType = values.mostPreciseType(a, b);
    switch (op.toLowerCase()) {
      case '+':
        return resultType(this.check(a.number + b.number));
      case '-':
        return resultType(this.check(a.number - b.number));
      case '*':
        return resultType(this.check(a.number * b.number));
      case '/':
        return this.floatDivide(a, b);
      case '\\':
        return withIntegerCast(a, b, (a: values.NumericValue, b: values.NumericValue) => this.integerDivide(a, b));
      case 'mod':
        return withIntegerCast(a, b, (a: values.NumericValue, b: values.NumericValue) => this.integerRemainder(a, b));
      case '^':
        if (a.number == 0 && b.number < 0 && !this._typeCheck) {
          return values.ILLEGAL_FUNCTION_CALL;
        }
        return resultType(this.check(Math.pow(a.number, b.number)));
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
        return this.logicalOp(a, b, (a, b) => a & b);
      case 'or':
        return this.logicalOp(a, b, (a, b) => a | b);
      case 'xor':
        return this.logicalOp(a, b, (a, b) => a ^ b);
      case 'eqv':
        return this.logicalOp(a, b, (a, b) => ~(a ^ b));
      case 'imp':
        return this.logicalOp(a, b, (a, b) => ~a | b);
      default:
        throw new Error(`Unknown operator ${op}`);
    }
  }

  private evaluateStringBinaryOperator(op: string, a: values.StringValue, b: values.StringValue): values.Value {
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

  private floatDivide(a: values.NumericValue, b: values.NumericValue): values.Value {
    if (b.number == 0 && !this._typeCheck) {
      return values.DIVISION_BY_ZERO;
    }
    const result = this.check(a.number / b.number);
    if (a.tag == TypeTag.DOUBLE || b.tag == TypeTag.DOUBLE) {
      return values.double(result);
    }
    return values.single(result);
  }

  private integerDivide(a: values.NumericValue, b: values.NumericValue): values.Value {
    if (b.number == 0 && !this._typeCheck) {
      return values.DIVISION_BY_ZERO;
    }
    return values.numericTypeOf(a)(Math.floor(this.check(a.number / b.number)));
  }

  private integerRemainder(a: values.NumericValue, b: values.NumericValue): values.Value {
    if (b.number == 0 && !this._typeCheck) {
      return values.DIVISION_BY_ZERO;
    }
    return values.numericTypeOf(a)(this.check(a.number % b.number));
  }

  private logicalOp(a: values.NumericValue, b: values.NumericValue, op: (a: number, b: number) => number): values.Value {
    return withIntegerCast(a, b, (a, b) => values.numericTypeOf(a)(this.check(op(a.number, b.number))));
  }

  private check(n: number): number {
    return this._typeCheck ? 0 : n;
  }
}

export function parseLiteral(fullText: string): values.Value {
  const [text, sigil] = splitSigil(fullText);
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

function withIntegerCast(a: values.NumericValue, b: values.NumericValue, fn: (a: values.NumericValue, b: values.NumericValue) => values.Value): values.Value {
  const bothOperandsAreShortIntegers =
    a.tag == TypeTag.INTEGER && b.tag == TypeTag.INTEGER;
  const integerType = bothOperandsAreShortIntegers ? values.integer : values.long;
  // TODO: QBasic rounds floats to the nearest even.
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