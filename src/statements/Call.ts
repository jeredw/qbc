import { ExprContext } from "../../build/QBasicParser";
import { ControlFlow, ControlFlowTag, SavedValue } from "../ControlFlow";
import { evaluateExpression } from "../Expressions";
import { Value } from "../Values";
import { Variable } from "../Variables";
import { Statement } from "./Statement";

export interface ParameterBinding {
  parameter: Variable;
  expr?: ExprContext;
  value?: Value;
}

export class CallStatement extends Statement {
  chunkIndex: number;
  parameterBindings: ParameterBinding[];

  constructor(chunkIndex: number) {
    super();
    this.chunkIndex = chunkIndex;
    this.parameterBindings = [];
  }

  override execute(): ControlFlow {
    const savedValues: SavedValue[] = [];
    for (const {parameter, expr, value} of this.parameterBindings) {
      if (parameter.value) {
        savedValues.push({variable: parameter, value: parameter.value});
      }
      if (expr) {
        parameter.value = evaluateExpression({expr, resultType: parameter.type});
      } else if (value) {
        parameter.value = value;
      }
    }
    return {tag: ControlFlowTag.CALL, chunkIndex: this.chunkIndex, savedValues};
  }
}