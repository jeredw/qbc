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