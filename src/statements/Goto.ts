import { ControlFlow, ControlFlowTag } from "../ControlFlow";
import { Statement } from "./Statement";

export class GotoStatement extends Statement {
  constructor() {
    super();
  }

  override execute(): ControlFlow {
    return {tag: ControlFlowTag.GOTO};
  }
}