import { ExprContext } from "../../build/QBasicParser";
import { RuntimeError } from "../Errors";
import { evaluateExpression } from "../Expressions";
import { Memory } from "../Memory";
import { sameType, TypeTag } from "../Types";
import { getDefaultValue, isError, isReference, Value } from "../Values";
import { Variable } from "../Variables";
import { ExecutionContext } from "./ExecutionContext";
import { Statement } from "./Statement";

export class LetStatement extends Statement {
  variable: Variable;
  expr: ExprContext;

  constructor(variable: Variable, expr: ExprContext) {
    super();
    this.variable = variable;
    this.expr = expr;
  }

  override execute(context: ExecutionContext) {
    const value = evaluateExpression({
      expr: this.expr,
      resultType: this.variable.type,
      memory: context.memory,
    });
    if (isError(value)) {
      throw RuntimeError.fromToken(this.expr.start!, value);
    }
    assign(this.variable, value, context.memory);
  }
}

function assign(variable: Variable, value: Value, memory: Memory) {
  if (variable.type.tag == TypeTag.RECORD) {
    if (!isReference(value) || !sameType(variable.type, value.variable.type)) {
      throw new Error("invalid record assignment");
    }
    for (const [name, sourceVariable] of value.variable.elements!) {
      const targetVariable = variable.elements!.get(name)!;
      const [_, sourceValue] = memory.dereference(sourceVariable.address!);
      assign(targetVariable, sourceValue ?? getDefaultValue(sourceVariable), memory);
    }
    return;
  }
  const [address, _] = memory.dereference(variable.address!);
  memory.write(address, value);
}