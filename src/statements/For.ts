import { Token } from "antlr4ng";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { RuntimeError } from "../Errors.ts";
import { isError, isNumeric, numericTypeOf } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { Statement } from "./Statement.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { readNumber } from "../Memory.ts";

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
    const [counterAddress, counterValue] = context.memory.dereference(this.counter);
    if (!counterValue) {
      // A GOTO can jump into a for loop skipping loop initialization.  In that
      // case, the counter, increment, and end will be default initialized to 0,
      // and the loop will be an infinite loop.
      return {tag: ControlFlowTag.GOTO};
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
    context.memory.writeAddress(counterAddress, nextValue);
    // It's also possible to jump into a for loop with the counter already
    // nonzero.  In that case, NEXT will fall out of the loop.
    const end = readNumber(context.memory, this.end);
    if (increment == 0 || (increment > 0 && next <= end) || (increment < 0 && next >= end)) {
      return {tag: ControlFlowTag.GOTO};
    }
  }
}