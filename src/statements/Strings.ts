
import { Value, isString, string } from "../Values.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { BuiltinStatementArgs } from "../Builtins.ts";
import { asciiToString, stringToAscii } from "../AsciiChart.ts";

export class LcaseFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value): Value {
    if (!isString(input)) {
      throw new Error("expecting string");
    }
    return string(asciiToString(stringToAscii(input.string).map(lowerCase)));
  }
}

export class UcaseFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value): Value {
    if (!isString(input)) {
      throw new Error("expecting string");
    }
    return string(asciiToString(stringToAscii(input.string).map(upperCase)));
  }
}

function lowerCase(code: number): number {
  return code >= 65 && code <= 90 ? code + 32 : code;
}

function upperCase(code: number): number {
  return code >= 97 && code <= 122 ? code - 32 : code;
}