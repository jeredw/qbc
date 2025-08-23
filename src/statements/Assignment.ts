import { RuntimeError } from "../Errors.ts";
import { evaluateExpression, Expression } from "../Expressions.ts";
import { Memory } from "../Memory.ts";
import { sameType, TypeTag } from "../Types.ts";
import { isError } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";

export class LetStatement extends Statement {
  constructor(private variable: Variable, private expr: Expression) {
    super();
  }

  override execute(context: ExecutionContext) {
    const value = evaluateExpression({
      expr: this.expr,
      resultType: this.variable.type,
      memory: context.memory,
    });
    if (isError(value)) {
      throw RuntimeError.fromToken(this.expr.token, value);
    }
    context.memory.write(this.variable, value);
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