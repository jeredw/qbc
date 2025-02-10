import { Statement } from "./Statement.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";

export class BeepStatement extends Statement {
  constructor() {
    super()
  }

  override execute(context: ExecutionContext): ControlFlow {
    const promise = context.devices.speaker.beep();
    return {tag: ControlFlowTag.WAIT, promise};
  }
}