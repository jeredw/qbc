import { ExprContext } from "../../build/QBasicParser.ts";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { evaluateExpression } from "../Expressions.ts";
import { Address, StorageType } from "../Memory.ts";
import { getDefaultValue, isReference, reference, Value } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";

export interface Binding {
  parameter: Variable;
  expr?: ExprContext;
  variable?: Variable;
  initToZero?: boolean;
}

export class CallStatement extends Statement {
  constructor(
    private chunkIndex: number,
    private bindings: Binding[],
    private stackSize: number,
  ) {
    super();
  }

  override execute(context: ExecutionContext): ControlFlow {
    const frameIndex = context.memory.getStackFrameIndex();
    const writes: [Address, Value][] = [];
    const paramsToZero: Variable[] = [];
    for (const {parameter, expr, variable, initToZero} of this.bindings) {
      if (expr) {
        // Evaluate argument expression in the context of the current stack frame.
        const value = evaluateExpression({expr, resultType: parameter.type, memory: context.memory});
        writes.push([parameter.address!, value]);
        parameter.debugValue = value;
      } else if (variable) {
        if (variable.isParameter && variable.address) {
          // When passing a reference param from one procedure to another, reuse
          // the original reference to avoid unnecessary chains of references to
          // the same variable.
          const ref = context.memory.readAddress(variable.address!);
          if (ref && isReference(ref)) {
            writes.push([parameter.address!, ref]);
          } else {
            writes.push([parameter.address!, reference(variable, qualifyAddress(variable.address!, frameIndex))]);
          }
        } else if (variable.recordOffset) {
          // Record element symbols are not allocated, so we have to make a new
          // reference that offsets into the record.
          const [address, _] = context.memory.dereference(variable);
          writes.push([parameter.address!, reference(variable, qualifyAddress(address, frameIndex))]);
        } else {
          writes.push([parameter.address!, reference(variable, qualifyAddress(variable.address!, frameIndex))]);
        }
        parameter.debugValue = variable.debugValue;
      }
      if (initToZero) {
        paramsToZero.push(parameter);
      }
    }
    // Now create the new stack frame and initialize parameters.
    context.memory.pushStack(this.stackSize);
    for (const [address, value] of writes) {
      context.memory.writeAddress(address, value);
    }
    // Functions implicitly return 0 if they return nothing else.
    for (const parameter of paramsToZero) {
      context.memory.write(parameter, getDefaultValue(parameter));
    }
    return {tag: ControlFlowTag.CALL, chunkIndex: this.chunkIndex};
  }
}

function qualifyAddress(address: Address, frameIndex: number): Address {
  if (address.storageType === StorageType.AUTOMATIC &&
      address.frameIndex === undefined) {
    return {...address, frameIndex};
  }
  return address;
}