import { ExprContext } from "../../build/QBasicParser.ts";
import { EventTrapState } from "../Events.ts";
import { evaluateIntegerExpression } from "../Expressions.ts";
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