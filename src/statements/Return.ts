import { Token } from "antlr4ng";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { Statement } from "./Statement.ts";

export class ReturnStatement extends Statement {
  constructor(private where: ControlFlowTag, public start?: Token) {
    super();
  }

  override execute(): ControlFlow {
    return {tag: ControlFlowTag.RETURN, where: this.where};
  }
}