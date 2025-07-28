import { Token } from "antlr4ng";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { Statement } from "./Statement.ts";
import { ExprContext } from "../../build/QBasicParser.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { evaluateStringExpression } from "../Expressions.ts";

export class EndStatement extends Statement {
  constructor() {
    super();
  }

  override execute(): ControlFlow {
    return {tag: ControlFlowTag.HALT};
  }
}

export class StopStatement extends Statement {
  constructor() {
    super();
  }

  override execute(): ControlFlow {
    return {tag: ControlFlowTag.STOP};
  }
}

export class NoOpStatement extends Statement {
  constructor() {
    super();
  }

  override execute() {
  }
}

export class RunStatement extends Statement {
  constructor(private token: Token, private programExpr: ExprContext | null) {
    super();
  }

  override execute(context: ExecutionContext): ControlFlow {
    if (this.programExpr) {
      const program = evaluateStringExpression(this.programExpr, context.memory);
      return {tag: ControlFlowTag.RUN, program};
    }
    return {tag: ControlFlowTag.RUN};
  }
}