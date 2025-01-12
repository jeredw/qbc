import { ControlFlow, ControlFlowTag } from "../ControlFlow";
import { Statement } from "./Statement";

export class CallStatement extends Statement {
  chunkIndex: number;

  constructor(chunkIndex: number) {
    super();
    this.chunkIndex = chunkIndex;
  }

  override execute(): ControlFlow {
    return {tag: ControlFlowTag.CALL, chunkIndex: this.chunkIndex};
  }
}