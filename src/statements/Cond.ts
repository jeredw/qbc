import { ExprContext } from "../../build/QBasicParser.ts";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { evaluateIntegerExpression } from "../Expressions.ts";
import { Memory } from "../Memory.ts";
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
    const test = evaluateBooleanExpression(this.expr, context.memory);
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
    const test = evaluateBooleanExpression(this.expr, context.memory);
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
    if (!evaluateBooleanExpression(this.expr, context.memory)) {
      return { tag: ControlFlowTag.GOTO };
    }
  }
}

function evaluateBooleanExpression(expr: ExprContext, memory: Memory): boolean {
  return evaluateIntegerExpression(expr, memory) != 0 ;
}