import { ExprContext } from "../../build/QBasicParser.ts";
import { RuntimeError } from "../Errors.ts";
import { evaluateExpression } from "../Expressions.ts";
import { Memory } from "../Memory.ts";
import { sameType, TypeTag } from "../Types.ts";
import { getDefaultValue, isError, isReference, reference, Value } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";

export class LetStatement extends Statement {
  constructor(private variable: Variable, private expr: ExprContext) {
    super();
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

export class SwapStatement extends Statement {
  constructor(private a: Variable, private b: Variable) {
    super();
  }

  override execute(context: ExecutionContext) {
    swap(this.a, this.b, context.memory);
  }
}

function swap(a: Variable, b: Variable, memory: Memory) {
  if (a.type.tag === TypeTag.RECORD) {
    if (!sameType(a.type, b.type)) {
      throw new Error("invalid record swap");
    }
    for (const name of a.elements!.keys()) {
      const aElement = a.elements!.get(name)!;
      const bElement = b.elements!.get(name)!;
      swap(aElement, bElement, memory);
    }
    return;
  }
  const aValue = memory.read(a);
  const bValue = memory.read(b);
  memory.write(a, bValue);
  memory.write(b, aValue);
}

function assign(variable: Variable, value: Value, memory: Memory) {
  if (variable.type.tag == TypeTag.RECORD) {
    if (!isReference(value) || !sameType(variable.type, value.variable.type)) {
      throw new Error("invalid record assignment");
    }
    for (const [name, sourceVariable] of value.variable.elements!) {
      const targetVariable = variable.elements!.get(name)!;
      const [address, sourceValue] = memory.dereference(sourceVariable);
      if (sourceVariable.type.tag == TypeTag.RECORD) {
        assign(targetVariable, reference(sourceVariable, address), memory);
      } else {
        assign(targetVariable, sourceValue ?? getDefaultValue(sourceVariable), memory);
      }
    }
    return;
  }
  memory.write(variable, value);
}