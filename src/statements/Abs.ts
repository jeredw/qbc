import { Token } from "antlr4ng";
import { ExprContext } from "../../build/QBasicParser.ts";
import { RuntimeError } from "../Errors.ts";
import { evaluateExpression } from "../Expressions.ts";
import { Address, StorageType } from "../Memory.ts";
import { isError, isNumeric, isReference, numericTypeOf, Value } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";

export class AbsFunction extends Statement {
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
      resultType: this.result.type,
      memory: context.memory
    });
    if (!isNumeric(value)) {
      throw new Error("expecting number");
    }
    if (value.number < 0) {
      const negValue = numericTypeOf(value)(-value.number);
      if (isError(negValue)) {
        throw RuntimeError.fromToken(this.token, negValue);
      }
      context.memory.write(this.result.address!, negValue);
    } else {
      context.memory.write(this.result.address!, value);
    }
  }
}