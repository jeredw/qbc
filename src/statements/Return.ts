import { ControlFlow, ControlFlowTag } from "../ControlFlow";
import { Statement } from "./Statement";

export class ReturnStatement extends Statement {
  constructor() {
    super();
  }

  override execute(): ControlFlow {
    return {tag: ControlFlowTag.RETURN};
  }
}