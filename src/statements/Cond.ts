import { ExprContext } from "../../build/QBasicParser.ts";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { RuntimeError } from "../Errors.ts";
import { evaluateExpression } from "../Expressions.ts";
import { Memory } from "../Memory.ts";
import { isError, isNumeric, TYPE_MISMATCH } from "../Values.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";

export class DoTest extends Statement {
  isWhile: boolean;
  expr: ExprContext;

  constructor(isWhile: boolean, expr: ExprContext) {
    super();
    this.isWhile = isWhile;
    this.expr = expr;
  }

  override execute(context: ExecutionContext): ControlFlow | void {
    const test = evaluateBoolean(context.memory, this.expr);
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
    const test = evaluateBoolean(context.memory, this.expr);
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
    if (!evaluateBoolean(context.memory, this.expr)) {
      return { tag: ControlFlowTag.GOTO };
    }
  }
}

function evaluateBoolean(memory: Memory, expr: ExprContext): boolean {
  const value = evaluateExpression({expr: expr, memory});
  if (isError(value)) {
    throw RuntimeError.fromToken(expr.start!, value);
  }
  if (!isNumeric(value)) {
    throw RuntimeError.fromToken(expr.start!, TYPE_MISMATCH);
  }
  return value.number != 0;
}