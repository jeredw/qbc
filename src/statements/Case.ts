import { Case_exprContext, ExprContext } from "../../build/QBasicParser.ts";
import { compareAscii } from "../AsciiChart.ts";
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
          return check(test, other, (diff) => diff < 0);
        case '<=':
          return check(test, other, (diff) => diff <= 0);
        case '>':
          return check(test, other, (diff) => diff > 0);
        case '>=':
          return check(test, other, (diff) => diff >= 0);
        case '<>':
          return check(test, other, (diff) => diff != 0);
        case '=':
          return check(test, other, (diff) => diff == 0);
      }
    }
    if (this.condition.TO()) {
      const lower = this.evaluate(memory, this.condition._lower!);
      const upper = this.evaluate(memory, this.condition._upper!);
      return check(test, lower, (diff) => diff >= 0) &&
             check(test, upper, (diff) => diff <= 0);
    }
    const equal = this.evaluate(memory, this.condition._equal!);
    return check(test, equal, (diff) => diff == 0);
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

function check(a: Value, b: Value, predicate: (d: number) => boolean): boolean {
  if (isString(a) && isString(b)) {
    return predicate(compareAscii(a.string, b.string));
  }
  if (isNumeric(a) && isNumeric(b)) {
    return predicate(a.number - b.number);
  }
  return false;
}