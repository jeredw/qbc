import { ExprContext } from "../../build/QBasicParser.ts";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { evaluateExpression } from "../Expressions.ts";
import { Address, StorageType } from "../Memory.ts";
import { isReference, Value } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";

export interface StackVariable {
  variable: Variable;
  expr?: ExprContext;
  value?: Value;
  record?: Variable;
}

export class CallStatement extends Statement {
  constructor(
    private chunkIndex: number,
    private stackVariables: StackVariable[],
    private stackSize: number,
  ) {
    super();
  }

  override execute(context: ExecutionContext): ControlFlow {
    const frameIndex = context.memory.getStackFrameIndex();
    const writes: [Address, Value][] = [];
    for (const {variable, expr, value} of this.stackVariables) {
      if (expr) {
        // Evaluate argument expression in the context of the current stack frame.
        const value = evaluateExpression({expr, resultType: variable.type, memory: context.memory});
        writes.push([variable.address!, value]);
      } else if (value) {
        if (isReference(value) && value.variable.storageType == StorageType.AUTOMATIC) {
          // Explicitly mark that stack references refer to the current stack frame.
          const address = {...value.address, frameIndex};
          writes.push([variable.address!, {...value, address}]);
        } else {
          writes.push([variable.address!, value]);
        }
      }
    }
    // Now create the new stack frame and initialize parameters.
    context.memory.pushStack(this.stackSize);
    for (const [address, value] of writes) {
      context.memory.writeAddress(address, value);
    }
    return {tag: ControlFlowTag.CALL, chunkIndex: this.chunkIndex};
  }
}