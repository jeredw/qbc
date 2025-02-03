import { ExprContext } from "../../build/QBasicParser.ts";
import { RuntimeError } from "../Errors.ts";
import { evaluateExpression } from "../Expressions.ts";
import { Memory } from "../Memory.ts";
import { sameType, TypeTag } from "../Types.ts";
import { getDefaultValue, isError, isReference, Value } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";

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