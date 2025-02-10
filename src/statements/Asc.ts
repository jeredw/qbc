import { Token } from "antlr4ng";
import { ExprContext } from "../../build/QBasicParser.ts";
import { RuntimeError } from "../Errors.ts";
import { ILLEGAL_FUNCTION_CALL, integer, isString, Value } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { charToAscii } from "../AsciiChart.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";

export class AscFunction extends BuiltinFunction1 {
  constructor(token: Token, params: ExprContext[], result?: Variable) {
    super(token, params, result);
  }

  override calculate(input: Value): Value {
    if (!isString(input)) {
      throw new Error("expecting string");
    }
    const firstChar = input.string.at(0);
    if (firstChar === undefined) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    const code = charToAscii.get(firstChar);
    if (code === undefined) {
      throw new Error("unmapped character code");
    }
    return integer(code);
  }
}