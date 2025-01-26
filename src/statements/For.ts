import { Token } from "antlr4ng";
import { ControlFlow, ControlFlowTag } from "../ControlFlow";
import { RuntimeError } from "../Errors";
import { isError, isNumeric, numericTypeOf } from "../Values";
import { dereference, Variable } from "../Variables";
import { Statement } from "./Statement";

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

  override execute(): ControlFlow | void {
    const counter = dereference(this.counter);
    const start = getValueOrDefault(counter);
    const end = getValueOrDefault(this.end);
    const increment = getValueOrDefault(this.increment, 1);
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

  override execute(): ControlFlow | void {
    const counter = dereference(this.counter);
    if (!counter.value || !isNumeric(counter.value)) {
      throw new Error("must be numeric");
    }
    const next = counter.value.number + getValueOrDefault(this.increment, 1);
    const value = numericTypeOf(counter.value)(next);
    if (isError(value)) {
      throw RuntimeError.fromToken(this.forToken, value);
    }
    counter.value = value;
    const end = getValueOrDefault(this.end);
    if (next <= end) {
      return {tag: ControlFlowTag.GOTO};
    }
  }
}

function getValueOrDefault(variable: Variable | null, defaultValue: number = 0): number {
  if (!variable) {
    return defaultValue;
  }
  if (!variable.value || !isNumeric(variable.value)) {
    throw new Error("must be numeric");
  }
  return variable.value.number;
}