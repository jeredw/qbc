import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { Statement } from "./Statement.ts";

export class EndStatement extends Statement {
  constructor() {
    super();
  }

  override execute(): ControlFlow {
    return {tag: ControlFlowTag.HALT};
  }
}