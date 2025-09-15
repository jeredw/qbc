import { Token } from "antlr4ng";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { RuntimeError } from "../Errors.ts";
import { isError, isNumeric, numericTypeOf } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { Statement } from "./Statement.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { readNumber } from "../Memory.ts";
import { TypeTag } from "../Types.ts";

export class ForStatement extends Statement {
  constructor(
    private counter: Variable,
    private end: Variable,
    private increment: Variable | null
  ) {
    super();
  }

  override execute(context: ExecutionContext): ControlFlow | void {
    const start = readNumber(context.memory, this.counter);
    const end = readNumber(context.memory, this.end);
    const increment = readNumber(context.memory, this.increment, 1);
    if (end > start && increment < 0 || end < start && increment >= 0) {
      return { tag: ControlFlowTag.GOTO };
    }
  }
}

export class NextStatement extends Statement {
  constructor(
    private forToken: Token,
    private counter: Variable,
    private end: Variable,
    private increment: Variable | null
  ) {
    super();
  }

  override execute(context: ExecutionContext): ControlFlow | void {
    const counterValue = context.memory.read(this.counter);
    const endValue = context.memory.read(this.end);
    // When programs jump into the middle of a for loop that has never been
    // executed before, next behaves oddly.  Real programs depend on this
    // behavior, because of course they do.  (If the loop has been executed
    // previously, loop variables like "end" retain their prior values and next
    // behaves normally.)
    if (counterValue === undefined || endValue === undefined) {
      // For integer counters (but not long counters), always fall through.
      if (this.counter.type.tag === TypeTag.INTEGER) {
        return;
      }
      // Otherwise, counter <= 0 infinite loops and counter > 0 falls through.
      if (!counterValue) {
        return {tag: ControlFlowTag.GOTO};
      }
      if (!isNumeric(counterValue)) {
        throw new Error('expecting numeric loop counter');
      }
      if (counterValue.number <= 0) {
        return {tag: ControlFlowTag.GOTO};
      }
      return;
    }
    if (!isNumeric(counterValue)) {
      throw new Error('expecting numeric loop counter');
    }
    const increment = readNumber(context.memory, this.increment, 1);
    const next = counterValue.number + increment;
    const nextValue = numericTypeOf(counterValue)(next);
    if (isError(nextValue)) {
      throw RuntimeError.fromToken(this.forToken, nextValue);
    }
    context.memory.write(this.counter, nextValue);
    if (!isNumeric(endValue)) {
      throw new Error('expecting numeric end value');
    }
    const end = endValue.number;
    if (increment == 0 || (increment > 0 && next <= end) || (increment < 0 && next >= end)) {
      return {tag: ControlFlowTag.GOTO};
    }
  }
}