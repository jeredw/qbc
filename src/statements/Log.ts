import { cast, double, ILLEGAL_FUNCTION_CALL, isNumeric, single, Value } from "../Values.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { BuiltinStatementArgs } from "../Builtins.ts";
import { RuntimeError } from "../Errors.ts";
import { TypeTag } from "../Types.ts";

export class LogFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    if (input.number <= 0) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    if (input.tag == TypeTag.DOUBLE) {
      return cast(double(Math.log(input.number)), this.result.type);
    }
    return cast(single(Math.log(input.number)), this.result.type);
  }
}