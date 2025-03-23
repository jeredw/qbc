import { BuiltinStatementArgs } from "../Builtins.ts";
import { RuntimeError } from "../Errors.ts";
import { boolean, ILLEGAL_FUNCTION_CALL, integer, isNumeric, TYPE_MISMATCH, Value } from "../Values.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { ExecutionContext } from "./ExecutionContext.ts";

const MIN_STICK = 1;
const MAX_STICK = 200;

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
      state[0]?.axes[0] ?? 0,
      state[0]?.axes[1] ?? 0,
      state[1]?.axes[0] ?? 0,
      state[1]?.axes[1] ?? 0,
    ][axis];
    const t = (position + 1) / 2;
    const scaledPosition = Math.floor((1 - t) * MIN_STICK + t * MAX_STICK);
    return integer(scaledPosition);
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