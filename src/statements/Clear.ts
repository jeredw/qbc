import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";

export class ClearStatement extends Statement {
  constructor() {
    super();
  }

  override execute(context: ExecutionContext): ControlFlow {
    context.memory.clear();
    return {tag: ControlFlowTag.CLEAR};
  }
}