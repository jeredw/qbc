import { Statement } from "./Statement.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { BuiltinStatementArgs } from "../Builtins.ts";
import { ExprContext } from "../../build/QBasicParser.ts";
import { evaluateIntegerExpression } from "../Expressions.ts";
import { RuntimeError } from "../Errors.ts";
import { ILLEGAL_FUNCTION_CALL } from "../Values.ts";
import { TypeTag } from "../Types.ts";

export class BeepStatement extends Statement {
  constructor() {
    super()
  }

  override execute(context: ExecutionContext): ControlFlow {
    const promise = context.devices.speaker.beep();
    return {tag: ControlFlowTag.WAIT, promise};
  }
}

export class SoundStatement extends Statement {
  frequency: ExprContext;
  duration: ExprContext;

  constructor(private args: BuiltinStatementArgs) {
    super();
    this.frequency = this.args.params[0].expr!;
    this.duration = this.args.params[1].expr!;
  }

  execute(context: ExecutionContext): ControlFlow | void {
    const frequency = evaluateIntegerExpression(this.frequency, context.memory);
    if (frequency < 37) {
      throw RuntimeError.fromToken(this.args.token, ILLEGAL_FUNCTION_CALL);
    }
    const duration = evaluateIntegerExpression(this.duration, context.memory, { tag: TypeTag.LONG });
    if (duration < 0 || duration > 65535) {
      throw RuntimeError.fromToken(this.args.token, ILLEGAL_FUNCTION_CALL);
    }
    const promise = context.devices.speaker.tone(frequency, duration);
    return {tag: ControlFlowTag.WAIT, promise};
  }
}