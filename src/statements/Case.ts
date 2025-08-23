import { Token } from "antlr4ng";
import { compareAscii } from "../AsciiChart.ts";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { RuntimeError } from "../Errors.ts";
import { evaluateExpression, Expression } from "../Expressions.ts";
import { Memory } from "../Memory.ts";
import { getDefaultValue, isError, isNumeric, isString, Value } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";

export enum CaseComparison {
  LESS = 1,
  LESS_EQUAL,
  GREATER,
  GREATER_EQUAL,
  NOT_EQUAL,
  EQUAL
}

export interface CaseExpression {
  token: Token;
  // IS comparison
  comparison?: CaseComparison;
  other?: Expression;
  // Range test
  lower?: Expression;
  upper?: Expression;
  // Implicit equality test
  equal?: Expression;
}

export class CaseStatement extends Statement {
  constructor(
    private test: Variable,
    private condition: CaseExpression
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
    const test = memory.read(this.test) ?? getDefaultValue(this.test);
    if (this.condition.comparison && this.condition.other) {
      const other = this.evaluate(memory, this.condition.other);
      switch (this.condition.comparison) {
        case CaseComparison.LESS:
          return check(test, other, (diff) => diff < 0);
        case CaseComparison.LESS_EQUAL:
          return check(test, other, (diff) => diff <= 0);
        case CaseComparison.GREATER:
          return check(test, other, (diff) => diff > 0);
        case CaseComparison.GREATER_EQUAL:
          return check(test, other, (diff) => diff >= 0);
        case CaseComparison.NOT_EQUAL:
          return check(test, other, (diff) => diff != 0);
        case CaseComparison.EQUAL:
          return check(test, other, (diff) => diff == 0);
      }
    }
    if (this.condition.lower && this.condition.upper) {
      const lower = this.evaluate(memory, this.condition.lower);
      const upper = this.evaluate(memory, this.condition.upper);
      return check(test, lower, (diff) => diff >= 0) &&
             check(test, upper, (diff) => diff <= 0);
    }
    if (!this.condition.equal) {
      throw new Error('Case expression mising test');
    }
    const equal = this.evaluate(memory, this.condition.equal);
    return check(test, equal, (diff) => diff == 0);
  }

  private evaluate(memory: Memory, expr: Expression): Value {
    const value = evaluateExpression({
      expr,
      resultType: this.test.type,
      memory
    });
    if (isError(value)) {
      throw RuntimeError.fromToken(this.condition.token, value);
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