import { Token } from "antlr4ng";
import { ControlFlow, ControlFlowTag } from "../ControlFlow";
import { Statement } from "./Statement";

export class ReturnStatement extends Statement {
  start?: Token;
  where: ControlFlowTag;

  constructor(where: ControlFlowTag, start?: Token) {
    super();
    this.where = where;
    this.start = start;
  }

  override execute(): ControlFlow {
    return {tag: ControlFlowTag.RETURN, where: this.where};
  }
}