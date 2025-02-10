import { Token } from "antlr4ng";
import { ExprContext } from "../../build/QBasicParser.ts";
import { double, integer, isNumeric, long, single, Value } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";

export class CdblFunction extends BuiltinFunction1 {
  constructor(token: Token, params: ExprContext[], result?: Variable) {
    super(token, params, result);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return double(input.number);
  }
}

export class CsngFunction extends BuiltinFunction1 {
  constructor(token: Token, params: ExprContext[], result?: Variable) {
    super(token, params, result);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return single(input.number);
  }
}

export class CintFunction extends BuiltinFunction1 {
  constructor(token: Token, params: ExprContext[], result?: Variable) {
    super(token, params, result);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return integer(input.number);
  }
}

export class ClngFunction extends BuiltinFunction1 {
  constructor(token: Token, params: ExprContext[], result?: Variable) {
    super(token, params, result);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return long(input.number);
  }
}