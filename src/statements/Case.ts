import { Case_exprContext, ExprContext } from "../../build/QBasicParser.ts";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { RuntimeError } from "../Errors.ts";
import { evaluateExpression } from "../Expressions.ts";
import { Memory } from "../Memory.ts";
import { getDefaultValue, isError, isNumeric, isString, Value } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";

export class CaseStatement extends Statement {
  constructor(
    private test: Variable,
    private condition: Case_exprContext
  ) {
    super();
    this.test = test;
    this.condition = condition;
  }

  override execute(context: ExecutionContext): ControlFlow | void {
    if (this.match(context.memory)) {
      return {tag: ControlFlowTag.GOTO};
    }
  }

  private match(memory: Memory): boolean {
    let [_, test] = memory.dereference(this.test);
    if (!test) {
      test = getDefaultValue(this.test);
    }
    if (this.condition.IS()) {
      const other = this.evaluate(memory, this.condition._other!);
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
      const lower = this.evaluate(memory, this.condition._lower!);
      const upper = this.evaluate(memory, this.condition._upper!);
      return check(test, lower, (a, b) => a >= b) &&
             check(test, upper, (a, b) => a <= b);
    }
    const equal = this.evaluate(memory, this.condition._equal!);
    return check(test, equal, (a, b) => a == b);
  }

  private evaluate(memory: Memory, expr: ExprContext): Value {
    const value = evaluateExpression({
      expr,
      resultType: this.test.type,
      memory
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