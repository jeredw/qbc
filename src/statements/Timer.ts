import { single } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";

export class TimerFunction extends Statement {
  constructor(private result: Variable) {
    super();
  }

  override execute(context: ExecutionContext) {
    const timestamp = context.devices.timer.timer();
    context.memory.write(this.result, single(timestamp));
  }
}