import { evaluateExpression } from "../Expressions";
import { ExecutionContext } from "./ExecutionContext";
import { Statement } from "./Statement";

export class LetStatement extends Statement {
  constructor() {
    super();
  }

  override execute(context: ExecutionContext) {
  }
}