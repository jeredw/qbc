import { Token } from "antlr4ng";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { RuntimeError } from "../Errors.ts";

export class ErrorHandlerStatement extends Statement {
  constructor(private token: Token) {
    super();
  }

  override execute(context: ExecutionContext) {
    if (context.errorHandling.active && this.targetIndex === undefined) {
      // ON ERROR GOTO 0 inside an error handler re-throws the error and exits.
      throw RuntimeError.fromToken(this.token, context.errorHandling.error!);
    }
    context.errorHandling.targetIndex = this.targetIndex;
    context.errorHandling.token = this.token;
  }
}

export class ResumeStatement extends Statement {
  constructor(
    public token: Token,
    private next: boolean
  ) {
    super();
  }

  override execute(context: ExecutionContext): ControlFlow {
    return {tag: ControlFlowTag.RESUME, targetIndex: this.targetIndex, next: this.next};
  }
}