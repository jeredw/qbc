import { Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";

  export class SwapStatement extends Statement {
    constructor(private a: Variable, private b: Variable) {
      super();
    }

    override execute(context: ExecutionContext) {
      const aValue = context.memory.read(this.a);
      const bValue = context.memory.read(this.b);
      context.memory.write(this.a, bValue);
      context.memory.write(this.b, aValue);
    }
  }