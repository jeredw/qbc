import { isNumeric, numericTypeOf, Value } from "../Values.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { BuiltinParams } from "../Builtins.ts";

export class AbsFunction extends BuiltinFunction1 {
  constructor(params: BuiltinParams) {
    super(params);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return numericTypeOf(input)(input.number < 0 ? -input.number : input.number);
  }
}