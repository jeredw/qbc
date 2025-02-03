import { Print_statementContext } from "../../build/QBasicParser";
import { evaluateExpression } from "../Expressions";
import { isNumeric, isString } from "../Values";
import { ExecutionContext } from "./ExecutionContext";
import { Statement } from "./Statement";

export class PrintStatement extends Statement {
  ast: Print_statementContext;

  constructor(ast: Print_statementContext) {
    super();
    this.ast = ast;
  }

  override execute(context: ExecutionContext) {
    for (const expr of this.ast.expr()) {
      const value = evaluateExpression({expr, memory: context.memory});
      if (isNumeric(value)) {
        context.devices.textScreen.print(value.number.toString(), true);
      } else if (isString(value)) {
        context.devices.textScreen.print(value.string, true);
      }
    }
  }
}