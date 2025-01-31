import { ExprContext } from "../../build/QBasicParser";
import { ControlFlow, ControlFlowTag } from "../ControlFlow";
import { RuntimeError } from "../Errors";
import { evaluateExpression } from "../Expressions";
import { TypeTag } from "../Types";
import { ILLEGAL_FUNCTION_CALL, isError, isNumeric } from "../Values";
import { Statement } from "./Statement";

export class BranchStatement extends Statement {
  gosub: boolean;

  constructor({gosub}: {gosub?: boolean}) {
    super();
    this.gosub = !!gosub;
  }

  override execute(): ControlFlow {
    return controlFlow(this.gosub);
  }
}

export class BranchIndexStatement extends Statement {
  gosub: boolean;
  expr: ExprContext;

  constructor({gosub, expr}: {gosub?: boolean, expr: ExprContext}) {
    super();
    this.gosub = !!gosub;
    this.expr = expr;
  }

  override execute(): ControlFlow | void {
    const value = evaluateExpression({
      expr: this.expr,
      resultType: {tag: TypeTag.INTEGER}
    });
    if (isError(value)) {
      throw RuntimeError.fromToken(this.expr.start!, value);
    }
    if (!isNumeric(value)) {
      throw new Error("expecting number");
    }
    const index = value.number;
    if (index < 0 || index > 255) {
      throw RuntimeError.fromToken(this.expr.start!, ILLEGAL_FUNCTION_CALL);
    }
    if (index > 0 && index <= this.targets.length) {
      this.targetIndex = this.targets[index - 1];
      return controlFlow(this.gosub);
    }
  }
}

function controlFlow(gosub: boolean): ControlFlow {
  return {tag: gosub ? ControlFlowTag.GOSUB : ControlFlowTag.GOTO};
}