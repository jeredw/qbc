import { ExprContext } from "../../build/QBasicParser";
import { ControlFlow, ControlFlowTag } from "../ControlFlow";
import { RuntimeError } from "../Errors";
import { evaluateExpression } from "../Expressions";
import { isError, isNumeric, TYPE_MISMATCH } from "../Values";
import { ExecutionContext } from "./ExecutionContext";
import { Statement } from "./Statement";

export class DoTest extends Statement {
  isWhile: boolean;
  expr: ExprContext;

  constructor(isWhile: boolean, expr: ExprContext) {
    super();
    this.isWhile = isWhile;
    this.expr = expr;
  }

  override execute(context: ExecutionContext): ControlFlow | void {
    const test = evaluateBoolean(this.expr, context);
    const shouldBranchOut = this.isWhile != test;
    if (shouldBranchOut) {
      return { tag: ControlFlowTag.GOTO };
    }
  }
}

export class LoopTest extends Statement {
  isWhile: boolean;
  expr: ExprContext;

  constructor(isWhile: boolean, expr: ExprContext) {
    super();
    this.isWhile = isWhile;
    this.expr = expr;
  }

  override execute(context: ExecutionContext): ControlFlow | void {
    const test = evaluateBoolean(this.expr, context);
    const shouldBranchBack = this.isWhile == test;
    if (shouldBranchBack) {
      return { tag: ControlFlowTag.GOTO };
    }
  }
}

export class IfTest extends Statement {
  expr: ExprContext;

  constructor(expr: ExprContext) {
    super();
    this.expr = expr;
  }

  override execute(context: ExecutionContext): ControlFlow | void {
    if (!evaluateBoolean(this.expr, context)) {
      return { tag: ControlFlowTag.GOTO };
    }
  }
}

function evaluateBoolean(expr: ExprContext, context: ExecutionContext): boolean {
  const value = evaluateExpression({
    expr: expr,
    symbols: context.symbols
  });
  if (isError(value)) {
    throw RuntimeError.fromToken(expr.start!, value);
  }
  if (!isNumeric(value)) {
    throw RuntimeError.fromToken(expr.start!, TYPE_MISMATCH);
  }
  return value.number != 0;
}