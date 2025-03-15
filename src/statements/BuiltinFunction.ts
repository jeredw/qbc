import { Token } from "antlr4ng";
import { Variable } from "../Variables.ts";
import { Statement } from "./Statement.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { evaluateExpression } from "../Expressions.ts";
import { isError, Value } from "../Values.ts";
import { RuntimeError } from "../Errors.ts";
import { BuiltinParam, BuiltinStatementArgs } from "../Builtins.ts";

export abstract class BuiltinFunction1 extends Statement {
  token: Token;
  params: BuiltinParam[];
  result: Variable;

  constructor({token, params, result}: BuiltinStatementArgs) {
    super();
    this.token = token;
    this.params = params;
    if (this.params.length != 1 || !this.params[0].expr) {
      throw new Error("expecting one expr argument");
    }
    if (!result) {
      throw new Error("expecting result")
    }
    this.result = result;
  }

  override execute(context: ExecutionContext) {
    const input = evaluateExpression({
      expr: this.params[0].expr!,
      memory: context.memory
    });
    const output = this.calculate(input, context);
    if (isError(output)) {
      throw RuntimeError.fromToken(this.token, output);
    }
    context.memory.write(this.result, output);
  }

  abstract calculate(input: Value, context: ExecutionContext): Value;
}