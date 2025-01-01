import { ControlFlow, ControlFlowTag } from "../ControlFlow";
import { Statement } from "./Statement";

export class ExitStatement extends Statement {
  private returnFromProcedure: boolean;

  constructor(returnFromProcedure: boolean) {
    super();
    this.returnFromProcedure = returnFromProcedure;
  }

  override execute(): ControlFlow {
    return this.returnFromProcedure ? {tag: ControlFlowTag.RETURN} : {tag: ControlFlowTag.GOTO};
  }
}