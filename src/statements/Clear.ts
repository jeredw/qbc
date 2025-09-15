import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { closeFile } from "./FileSystem.ts";
import { Statement } from "./Statement.ts";

export class ClearStatement extends Statement {
  constructor() {
    super();
  }

  override execute(context: ExecutionContext): ControlFlow {
    context.memory.clear();
    context.data.restore(0);
    for (const handle of context.files.handles.values()) {
      closeFile(handle);
    }
    context.files.handles.clear();
    return {tag: ControlFlowTag.CLEAR};
  }
}