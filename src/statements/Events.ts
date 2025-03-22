import { ExprContext } from "../../build/QBasicParser.ts";
import { BuiltinStatementArgs } from "../Builtins.ts";
import { ControlFlow } from "../ControlFlow.ts";
import { EventTrapState } from "../Events.ts";
import { evaluateIntegerExpression } from "../Expressions.ts";
import { TypeTag } from "../Types.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";

export enum EventType {
  TIMER
}

export class EventHandlerStatement extends Statement {
  constructor(private eventType: EventType, private param: ExprContext | undefined) {
    super();
  }

  override execute(context: ExecutionContext) {
    const param = this.param ? evaluateIntegerExpression(this.param, context.memory) : 0;
    switch (this.eventType) {
      case EventType.TIMER:
        context.events.timer.start(context.devices.timer.timer(), param, this.targetIndex!);
        break;
    }
  }
}

export class EventControlStatement extends Statement {
  constructor(
    private eventType: EventType,
    private param: ExprContext | undefined,
    private state: EventTrapState,
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const param = this.param ? evaluateIntegerExpression(this.param, context.memory) : 0;
    switch (this.eventType) {
      case EventType.TIMER:
        context.events.timer.setState(this.state);
        break;
    }
  }
}

export class SleepStatement extends Statement {
  durationExpr?: ExprContext;

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
    const numKeysPending = context.devices.keyboard.numKeysPending();
    context.events.sleep({start, duration, numKeysPending});
  }
}