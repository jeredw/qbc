import { Type } from "../Types";
import { Statement } from "./Statement";

export class DefFnStatement extends Statement {
  constructor(name: string, returnType: Type) {
    super();
  }

  override execute() {
    // TODO: Mark deffn active.
  }
}