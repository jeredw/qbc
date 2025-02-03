import { Token } from "antlr4ng";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { RuntimeError } from "../Errors.ts";
import { isError, isNumeric, numericTypeOf } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { Statement } from "./Statement.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Memory } from "../Memory.ts";

export class ForStatement extends Statement {
  counter: Variable;
  end: Variable;
  increment: Variable | null;

  constructor(counter: Variable, end: Variable, increment: Variable | null) {
    super();
    this.counter = counter;
    this.end = end;
    this.increment = increment;
  }

  override execute(context: ExecutionContext): ControlFlow | void {
    const start = getValueOrDefault(context.memory, this.counter);
    const end = getValueOrDefault(context.memory, this.end);
    const increment = getValueOrDefault(context.memory, this.increment, 1);
    if (end > start && increment < 0 || end < start && increment >= 0) {
      return { tag: ControlFlowTag.GOTO };
    }
  }
}

export class NextStatement extends Statement {
  forToken: Token;
  counter: Variable;
  end: Variable;
  increment: Variable | null;

  constructor(forToken: Token, counter: Variable, end: Variable, increment: Variable | null) {
    super();
    this.forToken = forToken;
    this.counter = counter;
    this.end = end;
    this.increment = increment;
  }

  override execute(context: ExecutionContext): ControlFlow | void {
    const [counterAddress, counterValue] = context.memory.dereference(this.counter.address!);
    if (!counterValue || !isNumeric(counterValue)) {
      throw new Error("must be numeric");
    }
    const increment = getValueOrDefault(context.memory, this.increment, 1);
    const next = counterValue.number + increment;
    const nextValue = numericTypeOf(counterValue)(next);
    if (isError(nextValue)) {
      throw RuntimeError.fromToken(this.forToken, nextValue);
    }
    context.memory.write(counterAddress, nextValue);
    const end = getValueOrDefault(context.memory, this.end);
    if (increment == 0 || (increment > 0 && next <= end) || (increment < 0 && next >= end)) {
      return {tag: ControlFlowTag.GOTO};
    }
  }
}

function getValueOrDefault(memory: Memory, variable: Variable | null, defaultValue: number = 0): number {
  if (!variable) {
    return defaultValue;
  }
  const [_, value] = memory.dereference(variable.address!);
  if (!value || !isNumeric(value)) {
    throw new Error("must be numeric");
  }
  return value.number;
}