import { ExprContext } from "../../build/QBasicParser";
import { ControlFlow, ControlFlowTag } from "../ControlFlow";
import { RuntimeError } from "../Errors";
import { evaluateExpression } from "../Expressions";
import { isError, isNumeric, TYPE_MISMATCH } from "../Values";
import { Statement } from "./Statement";

export class DoTest extends Statement {
  isWhile: boolean;
  expr: ExprContext;

  constructor(isWhile: boolean, expr: ExprContext) {
    super();
    this.isWhile = isWhile;
    this.expr = expr;
  }

  override execute(): ControlFlow | void {
    const test = evaluateBoolean(this.expr);
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

  override execute(): ControlFlow | void {
    const test = evaluateBoolean(this.expr);
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

  override execute(): ControlFlow | void {
    if (!evaluateBoolean(this.expr)) {
      return { tag: ControlFlowTag.GOTO };
    }
  }
}

function evaluateBoolean(expr: ExprContext): boolean {
  const value = evaluateExpression({expr: expr});
  if (isError(value)) {
    throw RuntimeError.fromToken(expr.start!, value);
  }
  if (!isNumeric(value)) {
    throw RuntimeError.fromToken(expr.start!, TYPE_MISMATCH);
  }
  return value.number != 0;
}