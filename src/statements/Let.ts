import { ExprContext } from "../../build/QBasicParser";
import { RuntimeError } from "../Errors";
import { evaluateExpression } from "../Expressions";
import { TypeTag } from "../Types";
import { getDefaultValueOfType, isError, isReference, Value } from "../Values";
import { dereference, Variable } from "../Variables";
import { Statement } from "./Statement";

export class LetStatement extends Statement {
  variable: Variable;
  expr: ExprContext;

  constructor(variable: Variable, expr: ExprContext) {
    super();
    this.variable = variable;
    this.expr = expr;
  }

  override execute() {
    const variable = dereference(this.variable);
    const value = evaluateExpression({
      expr: this.expr,
      resultType: variable.type,
    });
    if (isError(value)) {
      throw RuntimeError.fromToken(this.expr.start!, value);
    }
    assign(variable, value);
  }
}

function assign(target: Variable, source: Value) {
  if (source.tag == TypeTag.RECORD) {
    if (!target.value) {
      throw new Error("no value for record");
    }
    if (target.value.tag != TypeTag.RECORD ||
      source.recordType.name != target.value.recordType.name) {
      throw new Error("record type mismatch");
    }
    for (const [name, sourceVariable] of source.elements) {
      const targetVariable = target.value.elements.get(name);
      if (!targetVariable) {
        throw new Error("missing element in record");
      }
      if (!sourceVariable.value) {
        sourceVariable.value = getDefaultValueOfType(sourceVariable.type, {allowDefaultRecords: false});
      }
      assign(targetVariable, sourceVariable.value);
    }
    return;
  }
  target.value = source;
}