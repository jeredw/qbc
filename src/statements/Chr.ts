import { RuntimeError } from "../Errors.ts";
import { ILLEGAL_FUNCTION_CALL, isNumeric, string, Value } from "../Values.ts";
import { asciiToChar } from "../AsciiChart.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { BuiltinStatementArgs } from "../Builtins.ts";

export class ChrFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    const code = Math.round(input.number);
    if (code < 0 || code > 255) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    const char = asciiToChar.get(code);
    if (char === undefined) {
      throw new Error("unmapped character code");
    }
    return string(char);
  }
}