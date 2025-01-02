import { ExprContext } from "../../build/QBasicParser";
import { ControlFlow, ControlFlowTag } from "../ControlFlow";
import { RuntimeError } from "../Errors";
import { evaluateExpression } from "../Expressions";
import { isError, isNumeric, TYPE_MISMATCH } from "../Values";
import { ExecutionContext } from "./ExecutionContext";
import { Statement } from "./Statement";

export class IfStatement extends Statement {
  expr: ExprContext;

  constructor(expr: ExprContext) {
    super();
    this.expr = expr;
  }

  override execute(context: ExecutionContext): ControlFlow | void {
    const value = evaluateExpression({
      expr: this.expr,
      symbols: context.symbols
    });
    if (isError(value)) {
      throw RuntimeError.fromToken(this.expr.start!, value);
    }
    if (!isNumeric(value)) {
      throw RuntimeError.fromToken(this.expr.start!, TYPE_MISMATCH);
    }
    if (value.number == 0) {
      return { tag: ControlFlowTag.GOTO };
    }
  }
}