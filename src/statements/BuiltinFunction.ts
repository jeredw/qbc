import { Token } from "antlr4ng";
import { ExprContext } from "../../build/QBasicParser.ts";
import { Variable } from "../Variables.ts";
import { Statement } from "./Statement.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { evaluateExpression } from "../Expressions.ts";
import { isError, Value } from "../Values.ts";
import { RuntimeError } from "../Errors.ts";
import { BuiltinParams } from "../Builtins.ts";

export abstract class BuiltinFunction1 extends Statement {
  token: Token;
  params: ExprContext[];
  result: Variable;

  constructor(params: BuiltinParams) {
    super();
    this.token = params.token;
    this.params = params.params;
    if (this.params.length != 1) {
      throw new Error("expecting one argument");
    }
    if (!params.result) {
      throw new Error("expecting result")
    }
    this.result = params.result;
  }

  override execute(context: ExecutionContext) {
    const input = evaluateExpression({
      expr: this.params[0],
      memory: context.memory
    });
    const output = this.calculate(input);
    if (isError(output)) {
      throw RuntimeError.fromToken(this.token, output);
    }
    context.memory.write(this.result.address!, output);
  }

  abstract calculate(input: Value): Value;
}