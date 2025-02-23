import { cast, double, numericTypeOf, ILLEGAL_FUNCTION_CALL, isNumeric, single, Value } from "../Values.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { BuiltinStatementArgs } from "../Builtins.ts";
import { RuntimeError } from "../Errors.ts";
import { TypeTag } from "../Types.ts";

export class AbsFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return numericTypeOf(input)(input.number < 0 ? -input.number : input.number);
  }
}

export class AtnFunction extends BuiltinFunction1 {
  constructor(params: BuiltinStatementArgs) {
    super(params);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return cast(double(Math.atan(input.number)), this.result.type);
  }
}

export class CosFunction extends BuiltinFunction1 {
  constructor(params: BuiltinStatementArgs) {
    super(params);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return cast(double(Math.cos(input.number)), this.result.type);
  }
}

export class ExpFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    if (input.tag == TypeTag.DOUBLE) {
      return cast(double(Math.exp(input.number)), this.result.type);
    }
    return cast(single(Math.exp(input.number)), this.result.type);
  }
}

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

export class SinFunction extends BuiltinFunction1 {
  constructor(params: BuiltinStatementArgs) {
    super(params);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return cast(double(Math.sin(input.number)), this.result.type);
  }
}

export class TanFunction extends BuiltinFunction1 {
  constructor(params: BuiltinStatementArgs) {
    super(params);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return cast(double(Math.tan(input.number)), this.result.type);
  }
}