import { Token } from "antlr4ng";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { Statement } from "./Statement.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { evaluateStringExpression, Expression } from "../Expressions.ts";
import { BuiltinStatementArgs } from "../Builtins.ts";
import { readVariableToBytes } from "./Bits.ts";
import { getArrayDescriptor } from "./Arrays.ts";
import { ArrayBounds } from "../Variables.ts";

export class EndStatement extends Statement {
  constructor() {
    super();
  }

  override execute(): ControlFlow {
    return {tag: ControlFlowTag.HALT};
  }
}

export class StopStatement extends Statement {
  constructor() {
    super();
  }

  override execute(): ControlFlow {
    return {tag: ControlFlowTag.STOP};
  }
}

export class NoOpStatement extends Statement {
  constructor() {
    super();
  }

  override execute() {
  }
}

export class RunStatement extends Statement {
  constructor(private token: Token, private programExpr: Expression | null) {
    super();
  }

  override execute(context: ExecutionContext): ControlFlow {
    if (this.programExpr) {
      const program = evaluateStringExpression(this.programExpr, context.memory);
      return {tag: ControlFlowTag.RUN, program};
    }
    return {tag: ControlFlowTag.RUN};
  }
}

export class ChainStatement extends Statement {
  programExpr: Expression;

  constructor({params}: BuiltinStatementArgs) {
    super();
    if (!params[0] || !params[0].expr) {
      throw new Error("missing length arg");
    }
    this.programExpr = params[0].expr;
  }

  override execute(context: ExecutionContext): ControlFlow {
    const program = evaluateStringExpression(this.programExpr, context.memory);
    const {common} = context;
    common.serializedValues = common.chainVariables.map((variable) => {
      const type = variable.type;
      const buffer = readVariableToBytes(variable, context.memory);
      const bytes = new Uint8Array(buffer);
      let dimensions: ArrayBounds[] | undefined;
      if (variable.array) {
        const descriptor = getArrayDescriptor(variable, context.memory);
        dimensions = [...descriptor.dimensions];
      }
      return {type, dimensions, bytes};
    });
    return {tag: ControlFlowTag.CHAIN, program};
  }
}