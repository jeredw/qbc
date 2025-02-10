import { Token } from "antlr4ng";
import { ExprContext } from "../../build/QBasicParser.ts";
import { RuntimeError } from "../Errors.ts";
import { evaluateExpression } from "../Expressions.ts";
import { ILLEGAL_FUNCTION_CALL, integer, isError, isString, numericTypeOf } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";
import { charToAscii } from "../AsciiChart.ts";

export class AscFunction extends Statement {
  token: Token;
  params: ExprContext[];
  result: Variable;

  constructor(token: Token, params: ExprContext[], result?: Variable) {
    super();
    this.token = token;
    this.params = params;
    if (!result) {
      throw new Error("expecting result")
    }
    this.result = result;
  }

  override execute(context: ExecutionContext) {
    if (this.params.length != 1) {
      throw new Error("expecting one argument");
    }
    const value = evaluateExpression({
      expr: this.params[0],
      memory: context.memory
    });
    if (!isString(value)) {
      throw new Error("expecting string");
    }
    const firstChar = value.string.at(0);
    if (firstChar === undefined) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    const code = charToAscii.get(firstChar);
    if (code === undefined) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    context.memory.write(this.result.address!, integer(code));
  }
}