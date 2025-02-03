import { ExprContext } from "../../build/QBasicParser.ts";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { RuntimeError } from "../Errors.ts";
import { evaluateExpression } from "../Expressions.ts";
import { TypeTag } from "../Types.ts";
import { ILLEGAL_FUNCTION_CALL, isError, isNumeric } from "../Values.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";

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

  override execute(context: ExecutionContext): ControlFlow | void {
    const value = evaluateExpression({
      expr: this.expr,
      resultType: {tag: TypeTag.INTEGER},
      memory: context.memory,
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