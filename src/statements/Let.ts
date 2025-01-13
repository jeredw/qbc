import { ExprContext } from "../../build/QBasicParser";
import { RuntimeError } from "../Errors";
import { evaluateExpression } from "../Expressions";
import { isError } from "../Values";
import { dereference, Variable } from "../Variables";
import { Statement } from "./Statement";

export class LetStatement extends Statement {
  variable: Variable;
  expr: ExprContext;

  constructor(variable: Variable, expr: ExprContext) {
    super();
    this.variable = variable;
    this.expr = expr;
  }

  override execute() {
    const variable = dereference(this.variable);
    const value = evaluateExpression({
      expr: this.expr,
      resultType: variable.type,
    });
    if (isError(value)) {
      throw RuntimeError.fromToken(this.expr.start!, value);
    }
    variable.value = value;
  }
}