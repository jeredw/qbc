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
    const joystickA = context.devices.joystick.getState(0);
    const joystickB = context.devices.joystick.getState(1);
    const position = [
      joystickA.axes[0],
      joystickA.axes[1],
      joystickB.axes[0],
      joystickB.axes[1]
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
    const joystickA = context.devices.joystick.getState(0);
    const joystickB = context.devices.joystick.getState(1);
    const button = [
      joystickA.stickyButtons[0],
      joystickA.buttons[0],
      joystickB.stickyButtons[0],
      joystickB.buttons[0],
      joystickA.stickyButtons[1],
      joystickA.buttons[1],
      joystickB.stickyButtons[1],
      joystickB.buttons[1],
    ][index];
    return boolean(button);
  }
}