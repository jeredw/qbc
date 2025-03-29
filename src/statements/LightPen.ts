import { BuiltinStatementArgs } from "../Builtins.ts";
import { RuntimeError } from "../Errors.ts";
import { ILLEGAL_FUNCTION_CALL, integer, isNumeric, TYPE_MISMATCH, Value } from "../Values.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { ExecutionContext } from "./ExecutionContext.ts";

export class PenFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw RuntimeError.fromToken(this.token, TYPE_MISMATCH);
    }
    const stateIndex = input.number;
    if (stateIndex < 0 || stateIndex > 9) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    const state = context.devices.lightPen.getState();
    const result = [
      state.stickyPressed ? -1 : 0,
      state.lastPress.x,
      state.lastPress.y,
      state.pressed ? -1 : 0,
      state.lastTrigger.x,
      state.lastTrigger.y,
      state.lastPress.row,
      state.lastPress.column,
      state.lastTrigger.row,
      state.lastTrigger.column,
    ][stateIndex];
    return integer(result);
  }
}