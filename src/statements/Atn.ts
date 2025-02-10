import { Token } from "antlr4ng";
import { ExprContext } from "../../build/QBasicParser.ts";
import { cast, double, isNumeric, Value } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";

export class AtnFunction extends BuiltinFunction1 {
  constructor(token: Token, params: ExprContext[], result?: Variable) {
    super(token, params, result);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return cast(double(Math.atan(input.number)), this.result.type);
  }
}