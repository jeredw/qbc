import { cast, double, isNumeric, Value } from "../Values.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { BuiltinParams } from "../Builtins.ts";

export class AtnFunction extends BuiltinFunction1 {
  constructor(params: BuiltinParams) {
    super(params);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return cast(double(Math.atan(input.number)), this.result.type);
  }
}