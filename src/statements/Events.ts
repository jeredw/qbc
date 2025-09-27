import { Token } from "antlr4ng";
import { BuiltinStatementArgs } from "../Builtins.ts";
import { RuntimeError, ILLEGAL_FUNCTION_CALL } from "../Errors.ts";
import { EventChannelState } from "../Events.ts";
import { evaluateIntegerExpression, Expression } from "../Expressions.ts";
import { TypeTag } from "../Types.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";

export enum EventType {
  TIMER,
  JOYSTICK,
  KEYBOARD,
  PEN,
  PLAY,
  MODEM,
}

export class EventHandlerStatement extends Statement {
  constructor(
    private token: Token,
    private eventType: EventType,
    private param: Expression | undefined
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const param = this.param ? evaluateIntegerExpression(this.param, context.memory) : 0;
    context.events.enabled = true;
    switch (this.eventType) {
      case EventType.TIMER:
        if (param <= 0) {
          throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
        }
        if (this.targetIndex === undefined) {
          context.events.timer.setState(0, EventChannelState.OFF);
          return;
        }
        context.events.timer.configure(param, this.targetIndex!);
        break;
      case EventType.JOYSTICK:
        if (!(param === 0 || param === 2 || param === 4 || param === 6)) {
          throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
        }
        const buttonIndex = Math.floor(param / 2);
        if (this.targetIndex === undefined) {
          context.events.joystick.setState(buttonIndex, EventChannelState.OFF);
          return;
        }
        context.events.joystick.configure(buttonIndex, this.targetIndex!);
        break;
      case EventType.KEYBOARD:
        if (!isValidKey(param)) {
          throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
        }
        if (this.targetIndex === undefined) {
          context.events.keyboard.setState(param, EventChannelState.OFF);
          return;
        }
        context.events.keyboard.configure(param, this.targetIndex!);
        break;
      case EventType.PEN:
        if (this.targetIndex === undefined) {
          context.events.lightPen.setState(param, EventChannelState.OFF);
          return;
        }
        context.events.lightPen.configure(0, this.targetIndex!);
        break;
      case EventType.PLAY:
        if (param < 1 || param > 32) {
          throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
        }
        if (this.targetIndex === undefined) {
          context.events.play.setState(param, EventChannelState.OFF);
          return;
        }
        context.events.play.configure(param, this.targetIndex!);
        break;
      case EventType.MODEM:
        if (param !== 1) {
          throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
        }
        if (this.targetIndex === undefined) {
          context.events.modem.setState(param, EventChannelState.OFF);
          return;
        }
        context.events.modem.configure(0, this.targetIndex!);
        break;
    }
  }
}

export class EventControlStatement extends Statement {
  constructor(
    private token: Token,
    private eventType: EventType,
    private param: Expression | undefined,
    private state: EventChannelState,
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const param = this.param ? evaluateIntegerExpression(this.param, context.memory) : 0;
    context.events.enabled = true;
    switch (this.eventType) {
      case EventType.TIMER:
        if (this.state === EventChannelState.TEST) {
          context.devices.timer.testTick?.();
        } else {
          context.events.timer.setState(param, this.state);
        }
        break;
      case EventType.JOYSTICK:
        if (!(param === 0 || param === 2 || param === 4 || param === 6)) {
          throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
        }
        const buttonIndex = Math.floor(param / 2);
        if (this.state === EventChannelState.TEST) {
          context.devices.joystick.testTrigger?.(buttonIndex);
        } else {
          context.events.joystick.setState(buttonIndex, this.state);
        }
        break;
      case EventType.KEYBOARD:
        if (param === 0) {
          // 0 toggles state for all keys at once.
          for (let i = 1; i < 32; i++) {
            if (isValidKey(i)) {
              context.events.keyboard.setState(i, this.state);
            }
          }
          return;
        }
        if (!isValidKey(param)) {
          throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
        }
        if (this.state === EventChannelState.TEST) {
          context.devices.keyboard.testKey?.(param);
        } else {
          context.events.keyboard.setState(param, this.state);
        }
        break;
      case EventType.PEN:
        if (this.state === EventChannelState.TEST) {
          context.devices.lightPen.testPress?.();
        } else {
          context.events.lightPen.setState(param, this.state);
        }
        break;
      case EventType.PLAY:
        if (this.state === EventChannelState.TEST) {
          context.devices.speaker.testFinishNote?.();
        } else {
          context.events.play.setState(0, this.state);
        }
        break;
      case EventType.MODEM:
        if (this.state === EventChannelState.TEST) {
          context.devices.modem.testGenerateInput?.();
        } else {
          context.events.modem.setState(0, this.state);
        }
        break;
    }
  }
}

function isValidKey(param: number): boolean {
  return (param >= 1 && param <= 25) || param === 30 || param === 31; 
}

export class SleepStatement extends Statement {
  durationExpr?: Expression;

  constructor(private args: BuiltinStatementArgs) {
    super();
    if (args.params[0] && args.params[0].expr) {
      this.durationExpr = args.params[0].expr;
    }
  }

  override execute(context: ExecutionContext) {
    const duration = this.durationExpr ?
      evaluateIntegerExpression(this.durationExpr, context.memory, { tag: TypeTag.LONG }) : 0;
    const start = context.devices.timer.timer();
    const numKeyDownsPending = context.devices.keyboard.numKeyDownsPending();
    context.events.enabled = true;
    context.events.sleep({start, duration, numKeyDownsPending});
  }
}