import { ExprContext } from "../../build/QBasicParser.ts";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { evaluateIntegerExpression } from "../Expressions.ts";
import { Memory } from "../Memory.ts";
import { TypeTag } from "../Types.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";

export class DoTest extends Statement {
  constructor(private isWhile: boolean, private expr: ExprContext) {
    super();
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
  constructor(private isWhile: boolean, private expr: ExprContext) {
    super();
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
  constructor(private expr: ExprContext) {
    super();
  }

  override execute(context: ExecutionContext): ControlFlow | void {
    if (!evaluateBooleanExpression(this.expr, context.memory)) {
      return { tag: ControlFlowTag.GOTO };
    }
  }
}

function evaluateBooleanExpression(expr: ExprContext, memory: Memory): boolean {
  // Any numeric expression is a valid boolean. Floats evaluate true if != 0.
  return evaluateIntegerExpression(expr, memory, {tag: TypeTag.NUMERIC}) != 0;
}