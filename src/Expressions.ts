import {
  ExprContext,
  ExponentExprContext,
  NotExprContext,
  UnaryMinusExprContext,
  ValueExprContext,
  VarCallExprContext,
} from "../build/QBasicParser.ts";
import { QBasicParserListener } from "../build/QBasicParserListener.ts";
import { ParserRuleContext, ParseTreeWalker, TerminalNode } from "antlr4ng";
import * as values from "./Values.ts";
import { splitSigil, Type, typeOfSigil, TypeTag } from "./Types.ts";
import { SymbolTable } from "./SymbolTable.ts";
import { ParseError } from "./Errors.ts";

export function evaluateExpression({
  symbols,
  expr,
  constantExpression,
  typeCheck,
  resultType
}: {
  symbols: SymbolTable,
  expr: ExprContext,
  constantExpression?: boolean,
  typeCheck?: boolean,
  resultType?: Type
}): values.Value {
  const expressionListener = new ExpressionListener(symbols, !!constantExpression, !!typeCheck);
  ParseTreeWalker.DEFAULT.walk(expressionListener, expr);
  const result = expressionListener.getResult();
  return resultType ? values.cast(result, resultType) : result;
}

class ExpressionListener extends QBasicParserListener {
  private _stack: values.Value[] = [];
  private _symbols: SymbolTable;
  private _constantExpression: boolean;
  private _typeCheck: boolean;

  constructor(symbols: SymbolTable, constantExpression: boolean, typeCheck: boolean) {
    super();
    this._symbols = symbols;
    this._constantExpression = constantExpression;
    this._typeCheck = typeCheck;
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
    if (this._constantExpression) {
      throw ParseError.fromToken(ctx.EXP().symbol, "Illegal function call");
    }
    this.binaryOperator(ctx);
  }

  // Skip unary plus.

  override exitUnaryMinusExpr = (_ctx: UnaryMinusExprContext) => {
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
    this.push(this.parseValue(ctx.getText()));
  }

  override exitVarCallExpr = (dispatchCtx: VarCallExprContext) => {
    const ctx = dispatchCtx.variable_or_function_call();
    if (!this._constantExpression) {
      throw new Error("unimplemented");
    }
    if (ctx.args_or_indices()) {
      throw ParseError.fromToken(ctx.args_or_indices()!.LEFT_PAREN().symbol, "Invalid constant");
    }
    if (ctx.FNID()) {
      // QBasic will actually try to lookup the fnid first and complain if it's not defined.
      // But even if it is defined, it's not a constant.
      throw ParseError.fromToken(ctx.FNID()!.symbol, "Invalid constant");
    }
    const [name, sigil] = splitSigil(ctx.ID(0)!.getText());
    const value = this._symbols.lookupConstant(name);
    if (!value) {
      throw ParseError.fromToken(ctx.ID(0)!.symbol, "Invalid constant");
    }
    if (sigil && typeOfSigil(sigil).tag != value.tag) {
      throw ParseError.fromToken(ctx.ID(0)!.symbol, "Duplicate definition");
    }
    this.push(value);
  }

  private parseValue(fullText: string): values.Value {
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
        return withIntegerCast(a, b, this.integerDivide);
      case 'mod':
        return withIntegerCast(a, b, this.integerRemainder);
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