import { BuiltinStatementArgs } from "../Builtins.ts";
import { RuntimeError, ILLEGAL_FUNCTION_CALL, TYPE_MISMATCH } from "../Errors.ts";
import { boolean, integer, isNumeric, Value } from "../Values.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { ExecutionContext } from "./ExecutionContext.ts";

export class StickFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw RuntimeError.fromToken(this.token, TYPE_MISMATCH);
    }
    const axis = input.number;
    if (axis < 0 || axis > 3) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    const state = context.devices.joystick.getState();
    const position = [
      state[0]?.scaledAxes[0] ?? 0,
      state[0]?.scaledAxes[1] ?? 0,
      state[1]?.scaledAxes[0] ?? 0,
      state[1]?.scaledAxes[1] ?? 0,
    ][axis];
    return integer(position);
  }
}

export class StrigFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw RuntimeError.fromToken(this.token, TYPE_MISMATCH);
    }
    const index = input.number;
    if (index < 0 || index > 7) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    const joystick = context.devices.joystick;
    const state = joystick.getState();
    const button = [
      !!state[0]?.stickyButtons[0],
      !!state[0]?.buttons[0],
      !!state[1]?.stickyButtons[0],
      !!state[1]?.buttons[0],
      !!state[0]?.stickyButtons[1],
      !!state[0]?.buttons[1],
      !!state[1]?.stickyButtons[1],
      !!state[1]?.buttons[1],
    ][index];
    return boolean(button);
  }
}