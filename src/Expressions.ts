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
import { ParserRuleContext, ParseTreeWalker, Token } from "antlr4ng";
import * as values from "./Values.ts";
import { isNumericTag, isStringTag, splitSigil, Type, TypeTag } from "./Types.ts";
import { ParseError, RuntimeError, TYPE_MISMATCH, ILLEGAL_FUNCTION_CALL, DIVISION_BY_ZERO, ILLEGAL_NUMBER, OVERFLOW } from "./Errors.ts";
import { isConstant, isVariable } from "./SymbolTable.ts";
import { Memory } from "./Memory.ts";
import { Variable } from "./Variables.ts";
import { roundToNearestEven } from "./Math.ts";
import { getTyperContext } from "./ExtraParserContext.ts";
import { compareAscii, trim } from "./AsciiChart.ts";

export interface Expression {
  token: Token;
  resultType: Type;
  bytecode: Bytecode[];
  ctx: ExprContext;
}

export function evaluateStringExpression(expr: Expression, memory: Memory): string {
  const value = evaluateExpression({
    expr,
    resultType: {tag: TypeTag.STRING},
    memory
  });
  if (values.isError(value)) {
    throw RuntimeError.fromToken(expr.token, value);
  }
  if (!values.isString(value)) {
    throw RuntimeError.fromToken(expr.token, TYPE_MISMATCH);
  }
  return value.string;
}

export function evaluateIntegerExpression(expr: Expression, memory: Memory, resultType?: Type): number {
  const value = evaluateExpression({
    expr,
    resultType: resultType ?? {tag: TypeTag.INTEGER},
    memory
  });
  if (values.isError(value)) {
    throw RuntimeError.fromToken(expr.token, value);
  }
  if (!values.isNumeric(value)) {
    throw RuntimeError.fromToken(expr.token, TYPE_MISMATCH);
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
  const compiled = compileExpression(expr, expr.start!, resultType ?? { tag: TypeTag.ANY }, true);
  const result = new BytecodeEvaluator(compiled).evaluate();
  return resultType ? values.cast(result, resultType) : result;
}

export function evaluateExpression({
  expr,
  resultType,
  memory,
}: {
  expr: Expression,
  resultType?: Type,
  memory: Memory,
}): values.Value {
  const result = new BytecodeEvaluator(expr).evaluate(memory);
  return resultType ? values.cast(result, resultType) : result;
}

export function compileExpression(expr: ExprContext, token: Token, desiredType: Type, constantExpression?: boolean): Expression {
  const compiler = new BytecodeCompiler(!!constantExpression);
  ParseTreeWalker.DEFAULT.walk(compiler, expr);
  const resultType = compiler.typeCheckResult(desiredType);
  if (!resultType) {
    throw ParseError.fromToken(token, "Type mismatch");
  }
  return {token, bytecode: compiler.getBytecode(), ctx: expr, resultType};
}

class BytecodeCompiler extends QBasicParserListener {
  private bytecode: Bytecode[] = [];
  private stack: TypeTag[] = [];
  private constantExpression: boolean;
  private callExpressionDepth: number;
  private maxStack: number;

  constructor(constantExpression: boolean) {
    super();
    this.constantExpression = constantExpression;
    this.callExpressionDepth = 0;
    this.maxStack = 0;
  }

  getBytecode(): Bytecode[] {
    return this.bytecode;
  }

  typeCheckResult(desiredType: Type): Type | undefined {
    if (this.maxStack > MAX_STACK) {
      throw new Error(`This is embarrassing, but I'll need more MAX_STACK.`);
    }
    const resultTag = this.pop();
    this.emitReturn(resultTag);
    switch (desiredType.tag) {
      case TypeTag.SINGLE:
      case TypeTag.DOUBLE:
      case TypeTag.INTEGER:
      case TypeTag.LONG:
        if (isNumericTag(resultTag)) {
          return desiredType;
        }
        break;
      case TypeTag.STRING:
      case TypeTag.FIXED_STRING:
        if (isStringTag(resultTag)) {
          return desiredType;
        }
        break;
      case TypeTag.RECORD:
        break;
      case TypeTag.NUMERIC:
        if (isNumericTag(resultTag)) {
          return {tag: resultTag} as Type;
        }
        break;
      case TypeTag.FLOAT:
        if (isNumericTag(resultTag)) {
          if (resultTag === TypeTag.DOUBLE) {
            return {tag: TypeTag.DOUBLE};
          }
          return {tag: TypeTag.SINGLE};
        }
        break;
      case TypeTag.ANY:
      case TypeTag.PRINTABLE:
        if (isNumericTag(resultTag) || isStringTag(resultTag)) {
          return {tag: resultTag} as Type;
        }
        break;
    }
  }

  private emit(op: Operation) {
    this.bytecode.push({op});
  }

  private emitPushString(string: string) {
    this.bytecode.push({op: Operation.PUSH_STRING, string: string});
  }

  private emitPushNumber(number: number) {
    this.bytecode.push({op: Operation.PUSH_NUMBER, number: number});
  }

  private emitPushStringVariable(variable: Variable) {
    if (variable.type.tag === TypeTag.FIXED_STRING) {
      this.bytecode.push({op: Operation.PUSH_STRING_VARIABLE, variable, maxLength: variable.type.maxLength});
    } else {
      this.bytecode.push({op: Operation.PUSH_STRING_VARIABLE, variable});
    }
  }

  private emitPushNumberVariable(variable: Variable) {
    this.bytecode.push({op: Operation.PUSH_NUMBER_VARIABLE, variable});
  }

  private emitReturn(t: TypeTag) {
    switch (t) {
      case TypeTag.DOUBLE:
        this.emit(Operation.RETURN_DOUBLE);
        break;
      case TypeTag.SINGLE:
        this.emit(Operation.RETURN_SINGLE);
        break;
      case TypeTag.LONG:
        this.emit(Operation.RETURN_LONG);
        break;
      case TypeTag.INTEGER:
        this.emit(Operation.RETURN_INTEGER);
        break;
      case TypeTag.FIXED_STRING:
      case TypeTag.STRING:
        this.emit(Operation.RETURN_STRING);
        break;
      default:
        throw new Error("Unsupported expression type.");
    }
  }

  private push(t: TypeTag) {
    this.stack.push(t);
    this.maxStack = Math.max(this.maxStack, this.stack.length);
  }

  private pop(): TypeTag {
    const result = this.stack.pop();
    if (result === undefined) {
      throw new Error('Stack underflow while compiling expression');
    }
    return result;
  }

  private visitValue(token: Token, value: values.Value) {
    if (values.isError(value)) {
      throw ParseError.fromToken(token, value.errorMessage);
    }
    if (values.isString(value)) {
      this.emitPushString(value.string);
    } else if (values.isNumeric(value)) {
      this.emitPushNumber(value.number);
    } else {
      throw new Error("Unknown value type");
    }
    this.push(value.tag);
  }

  private visitVariable(token: Token, variable: Variable) {
    if (isStringTag(variable.type.tag)) {
      this.emitPushStringVariable(variable);
    } else if (isNumericTag(variable.type.tag)) {
      this.emitPushNumberVariable(variable);
    } else {
      throw ParseError.fromToken(token, "Type mismatch");
    }
    this.push(variable.type.tag);
  }

  private binaryOperator = (ctx: ParserRuleContext) => {
    if (this.callExpressionDepth > 0) {
      return;
    }
    const op = ctx.getChild(1)!.getText();
    const b = this.pop();
    const a = this.pop();
    if (isNumericTag(a) && isNumericTag(b)) {
      this.push(this.compileNumericBinaryOperator(op, a, b));
    } else if (isStringTag(a) && isStringTag(b)) {
      if (this.constantExpression && op == '+') {
        throw ParseError.fromToken(ctx.start!, "Illegal function call");
      }
      this.push(this.compileStringBinaryOperator(ctx.start!, op));
    } else {
      throw ParseError.fromToken(ctx.start!, "Type mismatch");
    }
  }

  // Skip parens.

  override exitExponentExpr = (ctx: ExponentExprContext) => {
    if (this.callExpressionDepth > 0) {
      return;
    }
    if (this.constantExpression) {
      throw ParseError.fromToken(ctx.EXP().symbol, "Illegal function call");
    }
    this.binaryOperator(ctx);
  }

  // Skip unary plus.

  override exitUnaryMinusExpr = (ctx: UnaryMinusExprContext) => {
    if (this.callExpressionDepth > 0) {
      return;
    }
    const t = this.pop();
    if (!isNumericTag(t)) {
      throw ParseError.fromToken(ctx.MINUS().symbol, "Type mismatch");
    }
    // Note that k%=-32768:print -k% will overflow.
    this.visitMostPreciseTypeOp(Operation.NEG, Operation.NEG, Operation.NEG_LONG, Operation.NEG_INTEGER, t, t);
    this.push(t);
  }

  override exitMultiplyDivideExpr = this.binaryOperator;
  override exitIntegerDivideExpr = this.binaryOperator;
  override exitModExpr = this.binaryOperator;
  override exitPlusMinusExpr = this.binaryOperator;
  override exitComparisonExpr = this.binaryOperator;

  override exitNotExpr = (ctx: NotExprContext) => {
    if (this.callExpressionDepth > 0) {
      return;
    }
    const t = this.pop();
    if (!isNumericTag(t)) {
      throw ParseError.fromToken(ctx.NOT().symbol, "Type mismatch");
    }
    if (t === TypeTag.INTEGER || t === TypeTag.LONG) {
      this.emit(Operation.NOT);
      this.push(t);
    } else {
      this.emit(Operation.NOT_WITH_LONG_CONVERSION);
      this.push(TypeTag.LONG);
    }
  }

  override exitAndExpr = this.binaryOperator;
  override exitOrExpr = this.binaryOperator;
  override exitXorExpr = this.binaryOperator;
  override exitEqvExpr = this.binaryOperator;
  override exitImpExpr = this.binaryOperator;

  override exitValueExpr = (ctx: ValueExprContext) => {
    if (this.callExpressionDepth > 0) {
      return;
    }
    const literal = parseLiteral(ctx.getText());
    this.visitValue(ctx.start!, literal);
  }

  override enterBuiltin_function = (ctx: Builtin_functionContext) => {
    this.callExpressionDepth++;
  }

  override exitBuiltin_function = (ctx: Builtin_functionContext) => {
    this.callExpressionDepth--;
    if (this.callExpressionDepth > 0) {
      return;
    }
    const result = getTyperContext(ctx).$result;
    if (!result) {
      throw new Error('Missing result variable');
    }
    this.visitVariable(ctx.start!, result);
  }

  override enterVarCallExpr = (dispatchCtx: VarCallExprContext) => {
    this.callExpressionDepth++;
    if (this.callExpressionDepth > 1) {
      // Do not recurse into argument expressions.  Those are evaluated separately.
      return;
    }
    const ctx = dispatchCtx.variable_or_function_call();
    if (this.constantExpression) {
      const constant = getTyperContext(ctx).$constant;
      if (!constant) {
        throw ParseError.fromToken(ctx.start!, "Invalid constant");
      }
      this.visitValue(ctx.start!, constant.value);
      return;
    }
    const result = getTyperContext(ctx).$result;
    if (result) {
      this.visitVariable(ctx.start!, result);
      return;
    }
    const symbol = getTyperContext(ctx).$symbol;
    if (!symbol) {
      throw new Error("Missing symbol");
    }
    if (isConstant(symbol)) {
      this.visitValue(ctx.start!, symbol.constant.value);
      return;
    }
    if (isVariable(symbol)) {
      this.visitVariable(ctx.start!, symbol.variable);
      return;
    }
    throw new Error("Missing result for function call");
  }

  override exitVarCallExpr = (_ctx: VarCallExprContext) => {
    this.callExpressionDepth--;
  }

  private compileNumericBinaryOperator(op: string, a: TypeTag, b: TypeTag): TypeTag {
    switch (op.toLowerCase()) {
      case '+':
        return this.visitMostPreciseTypeOp(Operation.ADD_DOUBLE, Operation.ADD_SINGLE, Operation.ADD_LONG, Operation.ADD_INTEGER, a, b);
      case '-':
        return this.visitMostPreciseTypeOp(Operation.SUB_DOUBLE, Operation.SUB_SINGLE, Operation.SUB_LONG, Operation.SUB_INTEGER, a, b);
      case '*':
        return this.visitMostPreciseTypeOp(Operation.MUL_DOUBLE, Operation.MUL_SINGLE, Operation.MUL_LONG, Operation.MUL_INTEGER, a, b);
      case '/':
        return this.visitFloatOp(Operation.FDIV_DOUBLE, Operation.FDIV_SINGLE, a, b);
      case '\\':
        return this.visitIntegerOp(Operation.IDIV_LONG, Operation.IDIV_INTEGER, a, b);
      case 'mod':
        return this.visitIntegerOp(Operation.IMOD_LONG, Operation.IMOD_INTEGER, a, b);
      case '^':
        return this.visitFloatOp(Operation.FEXP_DOUBLE, Operation.FEXP_SINGLE, a, b);
      case '=':
        this.emit(Operation.CMP_EQ);
        return TypeTag.INTEGER;
      case '<':
        this.emit(Operation.CMP_LT);
        return TypeTag.INTEGER;
      case '<=':
        this.emit(Operation.CMP_LE);
        return TypeTag.INTEGER;
      case '<>':
        this.emit(Operation.CMP_NE);
        return TypeTag.INTEGER;
      case '>=':
        this.emit(Operation.CMP_GE);
        return TypeTag.INTEGER;
      case '>':
        this.emit(Operation.CMP_GT);
        return TypeTag.INTEGER;
      case 'and':
        return this.visitIntegerOp(Operation.AND, Operation.AND, a, b);
      case 'or':
        return this.visitIntegerOp(Operation.OR, Operation.OR, a, b);
      case 'xor':
        return this.visitIntegerOp(Operation.XOR, Operation.XOR, a, b);
      case 'eqv':
        return this.visitIntegerOp(Operation.EQV, Operation.EQV, a, b);
      case 'imp':
        return this.visitIntegerOp(Operation.IMP, Operation.IMP, a, b);
      default:
        throw new Error(`Unknown operator ${op}`);
    }
  }

  private visitMostPreciseTypeOp(
    opDouble: Operation,
    opSingle: Operation,
    opLong: Operation,
    opInteger: Operation,
    a: TypeTag,
    b: TypeTag
  ): TypeTag {
    if (a === TypeTag.DOUBLE || b === TypeTag.DOUBLE) {
      this.emit(opDouble);
      return TypeTag.DOUBLE;
    }
    if (a === TypeTag.SINGLE || b === TypeTag.SINGLE) {
      this.emit(opSingle);
      return TypeTag.SINGLE;
    }
    if (a === TypeTag.LONG || b === TypeTag.LONG) {
      this.emit(opLong);
      return TypeTag.LONG;
    }
    this.emit(opInteger);
    return TypeTag.INTEGER;
  }

  private visitFloatOp(opDouble: Operation, opSingle: Operation, a: TypeTag, b: TypeTag): TypeTag {
    if (a === TypeTag.DOUBLE || b === TypeTag.DOUBLE) {
      this.emit(opDouble);
      return TypeTag.DOUBLE;
    }
    this.emit(opSingle);
    return TypeTag.SINGLE;
  }

  private visitIntegerOp(opLong: Operation, opInteger: Operation, a: TypeTag, b: TypeTag): TypeTag {
    if (a === TypeTag.INTEGER && b === TypeTag.INTEGER) {
      this.emit(opInteger);
      return TypeTag.INTEGER;
    }
    if ((a === TypeTag.INTEGER || a === TypeTag.LONG) && (b === TypeTag.INTEGER || b === TypeTag.LONG)) {
      this.emit(opLong);
      return TypeTag.LONG;
    }
    this.emit(Operation.CONVERT_ARGS_TO_LONG);
    this.emit(opLong);
    return TypeTag.LONG;
  }

  private compileStringBinaryOperator(token: Token, op: string): TypeTag {
    switch (op.toLowerCase()) {
      case '+':
        this.emit(Operation.CONCATENATE);
        return TypeTag.STRING;
      case '=':
        this.emit(Operation.CMPS_EQ);
        return TypeTag.INTEGER;
      case '<':
        this.emit(Operation.CMPS_LT);
        return TypeTag.INTEGER;
      case '<=':
        this.emit(Operation.CMPS_LE);
        return TypeTag.INTEGER;
      case '<>':
        this.emit(Operation.CMPS_NE);
        return TypeTag.INTEGER;
      case '>=':
        this.emit(Operation.CMPS_GE);
        return TypeTag.INTEGER;
      case '>':
        this.emit(Operation.CMPS_GT);
        return TypeTag.INTEGER;
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
        throw ParseError.fromToken(token, "Type mismatch");
      default:
        throw new Error(`Unknown operator ${op}`);
    }
  }
}

enum Operation {
  UNKNOWN,
  PUSH_NUMBER,
  PUSH_STRING,
  PUSH_NUMBER_VARIABLE,
  PUSH_STRING_VARIABLE,
  ADD_DOUBLE,
  ADD_SINGLE,
  ADD_LONG,
  ADD_INTEGER,
  SUB_DOUBLE,
  SUB_SINGLE,
  SUB_LONG,
  SUB_INTEGER,
  MUL_DOUBLE,
  MUL_SINGLE,
  MUL_LONG,
  MUL_INTEGER,
  FDIV_DOUBLE,
  FDIV_SINGLE,
  FEXP_DOUBLE,
  FEXP_SINGLE,
  CONVERT_ARGS_TO_LONG,
  IDIV_LONG,
  IDIV_INTEGER,
  IMOD_LONG,
  IMOD_INTEGER,
  AND,
  OR,
  XOR,
  EQV,
  IMP,
  NOT,
  NOT_WITH_LONG_CONVERSION,
  NEG,
  NEG_LONG,
  NEG_INTEGER,
  CMP_EQ,
  CMP_LT,
  CMP_LE,
  CMP_NE,
  CMP_GE,
  CMP_GT,
  CMPS_EQ,
  CMPS_LT,
  CMPS_LE,
  CMPS_NE,
  CMPS_GE,
  CMPS_GT,
  CONCATENATE,
  RETURN_INTEGER,
  RETURN_LONG,
  RETURN_SINGLE,
  RETURN_DOUBLE,
  RETURN_STRING,
}

interface Bytecode {
  op: Operation;
  variable?: Variable;
  number?: number;
  string?: string;
  maxLength?: number;
}

const MAX_STACK = 1024;
const N: number[] = Array(MAX_STACK).fill(0);
const S: string[] = Array(MAX_STACK).fill("");

class BytecodeEvaluator {
  private np: number = 0;
  private sp: number = 0;

  constructor(private expr: Expression) {
  }

  evaluate(memory?: Memory): values.Value {
    for (const bytecode of this.expr.bytecode) {
      switch (bytecode.op) {
        case Operation.PUSH_NUMBER:
          N[this.np++] = bytecode.number!;
          break;
        case Operation.PUSH_STRING:
          S[this.sp++] = bytecode.string!;
          break;
        case Operation.PUSH_NUMBER_VARIABLE: {
          const value = memory?.read(bytecode.variable!) as values.NumericValue;
          N[this.np++] = value?.number ?? 0;
          break;
        }
        case Operation.PUSH_STRING_VARIABLE: {
          const value = memory?.read(bytecode.variable!) as values.StringValue;
          S[this.sp++] = value?.string ?? (bytecode.maxLength ? "\x00".repeat(bytecode.maxLength) : "");
          break;
        }
        case Operation.ADD_DOUBLE:
          this.np--;
          N[this.np - 1] += N[this.np];
          if (!isFinite(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.ADD_SINGLE:
          this.np--;
          N[this.np - 1] = Math.fround(N[this.np - 1] + N[this.np]);
          if (!isFinite(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.ADD_LONG:
          this.np--;
          N[this.np - 1] += N[this.np];
          if (isLongOverflow(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.ADD_INTEGER: {
          this.np--;
          N[this.np - 1] += N[this.np];
          if (isIntegerOverflow(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        }
        case Operation.SUB_DOUBLE:
          this.np--;
          N[this.np - 1] -= N[this.np];
          if (!isFinite(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.SUB_SINGLE:
          this.np--;
          N[this.np - 1] = Math.fround(N[this.np - 1] - N[this.np]);
          if (!isFinite(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.SUB_LONG:
          this.np--;
          N[this.np - 1] -= N[this.np];
          if (isLongOverflow(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.SUB_INTEGER:
          this.np--;
          N[this.np - 1] -= N[this.np];
          if (isIntegerOverflow(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.MUL_DOUBLE:
          this.np--;
          N[this.np - 1] *= N[this.np];
          if (!isFinite(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.MUL_SINGLE:
          this.np--;
          N[this.np - 1] = Math.fround(N[this.np - 1] * N[this.np]);
          if (!isFinite(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.MUL_LONG:
          this.np--;
          N[this.np - 1] *= N[this.np];
          if (isLongOverflow(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.MUL_INTEGER:
          this.np--;
          N[this.np - 1] *= N[this.np];
          if (isIntegerOverflow(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.FDIV_DOUBLE:
          this.np--;
          if (N[this.np] == 0) {
            return DIVISION_BY_ZERO;
          }
          N[this.np - 1] /= N[this.np];
          if (!isFinite(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.FDIV_SINGLE:
          this.np--;
          if (N[this.np] == 0) {
            return DIVISION_BY_ZERO;
          }
          N[this.np - 1] = Math.fround(N[this.np - 1] / N[this.np]);
          if (!isFinite(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.FEXP_DOUBLE:
          this.np--;
          if (N[this.np - 1] == 0 && N[this.np] < 0) {
            return ILLEGAL_FUNCTION_CALL;
          }
          N[this.np - 1] = Math.pow(N[this.np - 1], N[this.np]);
          if (!isFinite(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.FEXP_SINGLE:
          this.np--;
          if (N[this.np - 1] == 0 && N[this.np] < 0) {
            return ILLEGAL_FUNCTION_CALL;
          }
          N[this.np - 1] = Math.fround(Math.pow(N[this.np - 1], N[this.np]));
          if (!isFinite(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.CONVERT_ARGS_TO_LONG:
          N[this.np - 2] = roundToNearestEven(N[this.np - 2]);
          if (isLongOverflow(N[this.np - 2])) {
            return OVERFLOW;
          }
          N[this.np - 1] = roundToNearestEven(N[this.np - 1]);
          if (isLongOverflow(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.IDIV_LONG:
          this.np--;
          if (N[this.np] == 0) {
            return DIVISION_BY_ZERO;
          }
          N[this.np - 1] = Math.trunc(N[this.np - 1] / N[this.np]);
          if (isLongOverflow(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.IDIV_INTEGER:
          this.np--;
          if (N[this.np] == 0) {
            return DIVISION_BY_ZERO;
          }
          N[this.np - 1] = Math.trunc(N[this.np - 1] / N[this.np]);
          if (isIntegerOverflow(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.IMOD_LONG:
          this.np--;
          if (N[this.np] == 0) {
            return DIVISION_BY_ZERO;
          }
          N[this.np - 1] %= N[this.np];
          if (isLongOverflow(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.IMOD_INTEGER:
          this.np--;
          if (N[this.np] == 0) {
            return DIVISION_BY_ZERO;
          }
          N[this.np - 1] %= N[this.np];
          if (isIntegerOverflow(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.AND:
          N[this.np - 2] &= N[this.np - 1];
          this.np--;
          break;
        case Operation.OR:
          N[this.np - 2] |= N[this.np - 1];
          this.np--;
          break;
        case Operation.XOR:
          N[this.np - 2] ^= N[this.np - 1];
          this.np--;
          break;
        case Operation.EQV:
          N[this.np - 2] = ~(N[this.np - 2] ^ N[this.np - 1]);
          this.np--;
          break;
        case Operation.IMP:
          N[this.np - 2] = ~N[this.np - 2] | N[this.np - 1];
          this.np--;
          break;
        case Operation.NOT:
          N[this.np - 1] = ~N[this.np - 1];
          break;
        case Operation.NOT_WITH_LONG_CONVERSION:
          N[this.np - 1] = roundToNearestEven(N[this.np - 1]);
          if (isLongOverflow(N[this.np - 1])) {
            return OVERFLOW;
          }
          N[this.np - 1] = ~N[this.np - 1];
          break;
        case Operation.NEG:
          N[this.np - 1] = -N[this.np - 1];
          break;
        case Operation.NEG_LONG:
          N[this.np - 1] = -N[this.np - 1];
          if (isLongOverflow(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.NEG_INTEGER:
          N[this.np - 1] = -N[this.np - 1];
          if (isIntegerOverflow(N[this.np - 1])) {
            return OVERFLOW;
          }
          break;
        case Operation.CMP_EQ:
          N[this.np - 2] = N[this.np - 2] == N[this.np - 1] ? values.TRUE : values.FALSE;
          this.np--;
          break;
        case Operation.CMP_LT:
          N[this.np - 2] = N[this.np - 2] < N[this.np - 1] ? values.TRUE : values.FALSE;
          this.np--;
          break;
        case Operation.CMP_LE:
          N[this.np - 2] = N[this.np - 2] <= N[this.np - 1] ? values.TRUE : values.FALSE;
          this.np--;
          break;
        case Operation.CMP_NE:
          N[this.np - 2] = N[this.np - 2] != N[this.np - 1] ? values.TRUE : values.FALSE;
          this.np--;
          break;
        case Operation.CMP_GE:
          N[this.np - 2] = N[this.np - 2] >= N[this.np - 1] ? values.TRUE : values.FALSE;
          this.np--;
          break;
        case Operation.CMP_GT:
          N[this.np - 2] = N[this.np - 2] > N[this.np - 1] ? values.TRUE : values.FALSE;
          this.np--;
          break;
        case Operation.CMPS_EQ:
          N[this.np++] = S[this.sp - 2] == S[this.sp - 1] ? values.TRUE : values.FALSE;
          this.sp -= 2;
          break;
        case Operation.CMPS_LT:
          N[this.np++] = compareAscii(S[this.sp - 2], S[this.sp - 1]) < 0 ? values.TRUE : values.FALSE;
          this.sp -= 2;
          break;
        case Operation.CMPS_LE:
          N[this.np++] = compareAscii(S[this.sp - 2], S[this.sp - 1]) <= 0 ? values.TRUE : values.FALSE;
          this.sp -= 2;
          break;
        case Operation.CMPS_NE:
          N[this.np++] = S[this.sp - 2] != S[this.sp - 1] ? values.TRUE : values.FALSE;
          this.sp -= 2;
          break;
        case Operation.CMPS_GE:
          N[this.np++] = compareAscii(S[this.sp - 2], S[this.sp - 1]) >= 0 ? values.TRUE : values.FALSE;
          this.sp -= 2;
          break;
        case Operation.CMPS_GT:
          N[this.np++] = compareAscii(S[this.sp - 2], S[this.sp - 1]) > 0 ? values.TRUE : values.FALSE;
          this.sp -= 2;
          break;
        case Operation.CONCATENATE:
          S[this.sp - 2] += S[this.sp - 1];
          this.sp--;
          break;
        // These do not type check so that e.g. CVS() can return an inf.
        case Operation.RETURN_INTEGER:
          return {number: N[this.np - 1], tag: TypeTag.INTEGER};
        case Operation.RETURN_LONG:
          return {number: N[this.np - 1], tag: TypeTag.LONG};
        case Operation.RETURN_SINGLE:
          return {number: N[this.np - 1], tag: TypeTag.SINGLE};
        case Operation.RETURN_DOUBLE:
          return {number: N[this.np - 1], tag: TypeTag.DOUBLE};
        case Operation.RETURN_STRING:
          return {string: S[this.sp - 1], tag: TypeTag.STRING};
      }
    }
    return OVERFLOW;
  }
}

function isIntegerOverflow(n: number): boolean {
  return n < -32768 || n > 32767;
}

function isLongOverflow(n: number): boolean {
  return n < -2147483648 || n > 2147483647;
}

export function parseLiteral(fullText: string, forceDouble?: boolean): values.Value {
  const [text, sigil] = splitSigil(fullText);
  if (text.startsWith('"')) {
    if (text.endsWith('"')) {
      return values.string(text.substring(1, text.length - 1));
    }
    // QBasic automatically inserts missing close quotes at newlines.
    return values.string(text.substring(1));
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
  text = trim(text);
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
  fullText = trim(fullText);
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