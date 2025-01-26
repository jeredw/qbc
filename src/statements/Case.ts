import { Case_exprContext, ExprContext } from "../../build/QBasicParser";
import { ControlFlow, ControlFlowTag } from "../ControlFlow";
import { RuntimeError } from "../Errors";
import { evaluateExpression } from "../Expressions";
import { isError, isNumeric, isString, Value } from "../Values";
import { Variable } from "../Variables";
import { Statement } from "./Statement";

export class CaseStatement extends Statement {
  test: Variable;
  condition: Case_exprContext;

  constructor(test: Variable, condition: Case_exprContext) {
    super();
    this.test = test;
    this.condition = condition;
  }

  override execute(): ControlFlow | void {
    if (this.match()) {
      return {tag: ControlFlowTag.GOTO};
    }
  }

  private match(): boolean {
    const test = this.test.value!;
    if (this.condition.IS()) {
      const other = this.evaluate(this.condition._other!);
      const op = this.condition._op?.text;
      switch (op) {
        case '<':
          return check(test, other, (a, b) => a < b);
        case '<=':
          return check(test, other, (a, b) => a <= b);
        case '>':
          return check(test, other, (a, b) => a > b);
        case '>=':
          return check(test, other, (a, b) => a >= b);
        case '<>':
          return check(test, other, (a, b) => a != b);
        case '=':
          return check(test, other, (a, b) => a == b);
      }
    }
    if (this.condition.TO()) {
      const lower = this.evaluate(this.condition._lower!);
      const upper = this.evaluate(this.condition._upper!);
      return check(test, lower, (a, b) => a >= b) &&
             check(test, upper, (a, b) => a <= b);
    }
    const equal = this.evaluate(this.condition._equal!);
    return check(test, equal, (a, b) => a == b);
  }

  private evaluate(expr: ExprContext): Value {
    const value = evaluateExpression({
      expr, resultType: this.test.type,
    });
    if (isError(value)) {
      throw RuntimeError.fromToken(this.condition.start!, value);
    }
    return value;
  }
}

function check(a: Value, b: Value, predicate: (a: string | number, b: string | number) => boolean): boolean {
  if (isString(a) && isString(b)) {
    return predicate(a.string, b.string);
  }
  if (isNumeric(a) && isNumeric(b)) {
    return predicate(a.number, b.number);
  }
  return false;
}