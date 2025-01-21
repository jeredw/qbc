import { ExprContext } from "../../build/QBasicParser";
import { ControlFlow, ControlFlowTag, SavedValue } from "../ControlFlow";
import { evaluateExpression } from "../Expressions";
import { Value } from "../Values";
import { Variable } from "../Variables";
import { Statement } from "./Statement";

export interface StackFrame {
  variable: Variable;
  expr?: ExprContext;
  value?: Value;
}

export class CallStatement extends Statement {
  chunkIndex: number;
  stackFrame: StackFrame[];

  constructor(chunkIndex: number, stackFrame: StackFrame[]) {
    super();
    this.chunkIndex = chunkIndex;
    this.stackFrame = stackFrame;
  }

  override execute(): ControlFlow {
    const savedValues: SavedValue[] = [];
    for (const {variable, expr, value} of this.stackFrame) {
      if (variable.value) {
        savedValues.push({variable, value: variable.value});
      }
      if (expr) {
        variable.value = evaluateExpression({expr, resultType: variable.type});
      } else if (value) {
        variable.value = value;
      }
    }
    return {tag: ControlFlowTag.CALL, chunkIndex: this.chunkIndex, savedValues};
  }
}