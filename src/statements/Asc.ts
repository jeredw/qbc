import { RuntimeError } from "../Errors.ts";
import { ILLEGAL_FUNCTION_CALL, integer, isString, Value } from "../Values.ts";
import { charToAscii } from "../AsciiChart.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { BuiltinStatementArgs } from "../Builtins.ts";
import { ExecutionContext } from "./ExecutionContext.ts";

export class AscFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
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