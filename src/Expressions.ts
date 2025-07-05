import {
  ExprContext,
  ExponentExprContext,
  NotExprContext,
  UnaryMinusExprContext,
  ValueExprContext,
  VarCallExprContext,
  Builtin_functionContext,
} from "../build/QBasicParser.ts";
import { QBasicParserListener } from "../build/QBasicParserListener.ts";
import { ParserRuleContext, ParseTreeWalker } from "antlr4ng";
import * as values from "./Values.ts";
import { splitSigil, Type, TypeTag } from "./Types.ts";
import { ParseError, RuntimeError, TYPE_MISMATCH, ILLEGAL_FUNCTION_CALL, DIVISION_BY_ZERO, ILLEGAL_NUMBER, OVERFLOW } from "./Errors.ts";
import { isConstant, isVariable } from "./SymbolTable.ts";
import { Memory } from "./Memory.ts";
import { Variable } from "./Variables.ts";
import { roundToNearestEven } from "./Math.ts";
import { getTyperContext } from "./ExtraParserContext.ts";

export function evaluateStringExpression(expr: ExprContext, memory: Memory): string {
  const value = evaluateExpression({
    expr,
    resultType: {tag: TypeTag.STRING},
    memory
  });
  if (values.isError(value)) {
    throw RuntimeError.fromToken(expr.start!, value);
  }
  if (!values.isString(value)) {
    throw RuntimeError.fromToken(expr.start!, TYPE_MISMATCH);
  }
  return value.string;
}

export function evaluateIntegerExpression(expr: ExprContext, memory: Memory, resultType?: Type): number {
  const value = evaluateExpression({
    expr,
    resultType: resultType ?? {tag: TypeTag.INTEGER},
    memory
  });
  if (values.isError(value)) {
    throw RuntimeError.fromToken(expr.start!, value);
  }
  if (!values.isNumeric(value)) {
    throw RuntimeError.fromToken(expr.start!, TYPE_MISMATCH);
  }
  return value.number;
}

export function evaluateAsConstantExpression({
  expr,
  resultType,
}: {
  expr: ExprContext,
  resultType?: Type,
}): values.Value {
  const expressionListener = new ExpressionListener(true);
  ParseTreeWalker.DEFAULT.walk(expressionListener, expr);
  const result = expressionListener.getResult();
  return resultType ? values.cast(result, resultType) : result;
}

export function typeCheckExpression({
  expr,
  resultType,
}: {
  expr: ExprContext,
  resultType?: Type,
}): values.Value {
  const expressionListener = new ExpressionListener(false);
  ParseTreeWalker.DEFAULT.walk(expressionListener, expr);
  const result = expressionListener.getResult();
  return resultType ? values.cast(result, resultType) : result;
}

export function evaluateExpression({
  expr,
  resultType,
  memory,
}: {
  expr: ExprContext,
  resultType?: Type,
  memory: Memory,
}): values.Value {
  const forceDouble = resultType && resultType.tag == TypeTag.DOUBLE;
  const expressionListener = new ExpressionListener(false, memory, forceDouble);
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
  private _forceDouble: boolean;

  constructor(constantExpression: boolean, memory?: Memory, double?: boolean) {
    super();
    this._constantExpression = constantExpression;
    this._callExpressionDepth = 0;
    this._typeCheck = !memory && !constantExpression;
    this._memory = memory;
    this._forceDouble = !!double;
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
      this.push(TYPE_MISMATCH);
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
      this.push(TYPE_MISMATCH);
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
      this.push(TYPE_MISMATCH);
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
    this.push(parseLiteral(ctx.getText(), this._forceDouble));
  }

  override enterBuiltin_function = (ctx: Builtin_functionContext) => {
    this._callExpressionDepth++;
  }

  override exitBuiltin_function = (ctx: Builtin_functionContext) => {
    this._callExpressionDepth--;
    if (this._callExpressionDepth > 0) {
      return;
    }
    const result = getTyperContext(ctx).$result;
    if (!result) {
      throw new Error('missing result variable');
    }
    this.push(this.readVariable(result));
  }

  override enterVarCallExpr = (dispatchCtx: VarCallExprContext) => {
    this._callExpressionDepth++;
    if (this._callExpressionDepth > 1) {
      // Do not recurse into argument expressions.  Those are evaluated separately.
      return;
    }
    const ctx = dispatchCtx.variable_or_function_call();
    const result = getTyperContext(ctx).$result;
    if (result) {
      this.push(this.readVariable(result));
      return;
    }
    if (this._constantExpression) {
      const constant = getTyperContext(ctx).$constant;
      if (!constant) {
        throw ParseError.fromToken(ctx.start!, "Invalid constant");
      }
      this.push(constant.value);
      return;
    }
    const symbol = getTyperContext(ctx).$symbol;
    if (!symbol) {
      throw new Error("missing symbol");
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
      case '^': {
        if (a.number == 0 && b.number < 0 && !this._typeCheck) {
          return ILLEGAL_FUNCTION_CALL;
        }
        const resultType = values.mostPreciseFloatType(a, b);
        return resultType(this.check(Math.pow(a.number, b.number)));
      }
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
        return TYPE_MISMATCH;
      default:
        throw new Error(`Unknown operator ${op}`);
    }
  }

  private floatDivide(a: values.NumericValue, b: values.NumericValue): values.Value {
    if (b.number == 0 && !this._typeCheck) {
      return DIVISION_BY_ZERO;
    }
    const result = this.check(a.number / b.number);
    if (a.tag == TypeTag.DOUBLE || b.tag == TypeTag.DOUBLE) {
      return values.double(result);
    }
    return values.single(result);
  }

  private integerDivide(a: values.NumericValue, b: values.NumericValue): values.Value {
    if (b.number == 0 && !this._typeCheck) {
      return DIVISION_BY_ZERO;
    }
    // Integer division truncates.
    return values.numericTypeOf(a)(Math.trunc(this.check(a.number / b.number)));
  }

  private integerRemainder(a: values.NumericValue, b: values.NumericValue): values.Value {
    if (b.number == 0 && !this._typeCheck) {
      return DIVISION_BY_ZERO;
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

export function parseLiteral(fullText: string, forceDouble?: boolean): values.Value {
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
  return parseFloatConstant(text, sigil, forceDouble);
}

export function parseNumberFromString(fullText: string): values.Value | undefined {
  let [text, sigil] = splitSigil(fullText);
  text = text.trim();
  if (!isNumericLiteral(text)) {
    return;
  }
  if (text.toLowerCase().startsWith('&h')) {
    if (text.length == 2 + 9) {
      // QBasic's hex parser has a bug that accepts 9 hex digits and does this.
      // This only applies to VAL / DATA not literals in code.
      text = `${text.slice(0, 6)}${text.slice(7, 10)}0`;
    }
    return parseAmpConstant(text, 16, sigil);
  }
  if (text.toLowerCase().startsWith('&o')) {
    // &o123456712345 -> &o12345712340
    if (text.length == 2 + 12) {
      text = `${text.slice(0, 7)}${text.slice(8, 13)}0`;
    }
    return parseAmpConstant(text, 8, sigil);
  }
  text = text.replace(/ /g, '');
  if (/^[0-9]+$/.test(text)) {
    return parseIntegerConstant(text, sigil);
  }
  return parseFloatConstant(text, sigil, /* forceDouble */ true);
}

export function parseNumberFromStringPrefix(fullText: string): values.Value | undefined {
  fullText = fullText.trim();
  for (let i = fullText.length; i > 0; i--) {
    const prefix = fullText.slice(0, i);
    if (isNumericLiteral(prefix)) {
      return parseNumberFromString(prefix);
    }
  }
}

function isNumericLiteral(text: string): boolean {
  return /^-?\s*[0-9]+\s*[!#%&]?$/.test(text) ||
    /^&[Hh][0-9a-fA-F]{1,9}\s*[&%]?$/.test(text) ||
    /^&[Oo][0-7]{1,12}\s*[&%]?$/.test(text) ||
    /^-?\s*[0-9]+\s*\.\s*[0-9]*\s*([eEdD]\s*[-+]?\s*[0-9]+|[!#])?$/.test(text) ||
    /^-?\s*\.\s*[0-9]+\s*([eEdD]\s*[-+]?\s*[0-9]+|[!#])?$/.test(text) ||
    /^-?\s*[0-9]+\s*([eEdD]\s*[-+]?\s*[0-9]+|[!#])?$/.test(text);
}

function parseFloatConstant(text: string, sigil: string, forceDouble: boolean = false): values.Value {
  const n = parseFloat(text.toLowerCase().replace('d', 'e'));
  if (!isFinite(n)) {
    return OVERFLOW;
  }
  if (forceDouble) {
    return values.double(n);
  }
  const hasDoubleExponent = text.toLowerCase().includes('d');
  if (sigil == '#' || hasDoubleExponent) {
    return values.double(n);
  }
  // The IDE counts digits, so it reads "0000000.1" and ".10000000" as .1#.
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
      return n > 0x7fff ? ILLEGAL_NUMBER : values.integer(n);
    case '&':
      return n > 0x7fffffff ? ILLEGAL_NUMBER : values.long(n);
    default:
      return (n > 0x7fffffff) ? values.double(n) :
             (n > 0x7fff) ? values.long(n) :
             values.integer(n);
  }
}

function parseAmpConstant(text: string, base: number, sigil: string): values.Value {
  const n = parseInt(text.substring(2), base);
  if (n > 0xffffffff) {
    return OVERFLOW;
  }
  const signedInteger = n > 0x7fff ? n - 0x10000 : n;
  const signedLong = n > 0x7fffffff ? n - 0x100000000 : n;
  if (sigil == '%') {
    return n > 0xffff ? OVERFLOW : values.integer(signedInteger);
  }
  if (sigil == '&') {
    return values.long(signedLong);
  }
  return n > 0xffff ? values.long(signedLong) : values.integer(signedInteger);
}

function withIntegerCast(a: values.NumericValue, b: values.NumericValue, fn: (a: values.NumericValue, b: values.NumericValue) => values.Value): values.Value {
  const bothOperandsAreShortIntegers =
    a.tag == TypeTag.INTEGER && b.tag == TypeTag.INTEGER;
  const integerType = bothOperandsAreShortIntegers ? values.integer : values.long;
  const castA = integerType(roundToNearestEven(a.number));
  const castB = integerType(roundToNearestEven(b.number));
  if (!values.isNumeric(castA)) {
    return castA;
  }
  if (!values.isNumeric(castB)) {
    return castB;
  }
  return fn(castA, castB);
}