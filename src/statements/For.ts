import { Token } from "antlr4ng";
import { ControlFlow, ControlFlowTag } from "../ControlFlow";
import { RuntimeError } from "../Errors";
import { isError, isNumeric, numericTypeOf } from "../Values";
import { Variable } from "../Variables";
import { Statement } from "./Statement";
import { ExecutionContext } from "./ExecutionContext";
import { Memory } from "../Memory";

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
    if (end > start && increment < 0 || end < start && increment > 0) {
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
    const next = counterValue.number + getValueOrDefault(context.memory, this.increment, 1);
    const nextValue = numericTypeOf(counterValue)(next);
    if (isError(nextValue)) {
      throw RuntimeError.fromToken(this.forToken, nextValue);
    }
    context.memory.write(counterAddress, nextValue);
    const end = getValueOrDefault(context.memory, this.end);
    if (next <= end) {
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