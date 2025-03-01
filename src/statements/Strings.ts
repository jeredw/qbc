import { ILLEGAL_FUNCTION_CALL, Value, cast, double, isError, isNumeric, isString, string } from "../Values.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { BuiltinStatementArgs } from "../Builtins.ts";
import { asciiToString, stringToAscii } from "../AsciiChart.ts";
import { ExprContext } from "../../build/QBasicParser.ts";
import { Token } from "antlr4ng";
import { Variable } from "../Variables.ts";
import { evaluateIntegerExpression, evaluateStringExpression, parseNumberFromStringPrefix } from "../Expressions.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";
import { RuntimeError } from "../Errors.ts";
import { TypeTag } from "../Types.ts";

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

abstract class LRFunction extends Statement {
  token: Token;
  stringExpr: ExprContext;
  numExpr: ExprContext;
  result: Variable;

  constructor({token, params, result}: BuiltinStatementArgs) {
    super();
    this.token = token;
    if (params.length != 2) {
      throw new Error("expecting two params");
    }
    this.stringExpr = params[0].expr!;
    this.numExpr = params[1].expr!;
    if (!result) {
      throw new Error("expecting result")
    }
    this.result = result;
  }

  override execute(context: ExecutionContext) {
    const string = evaluateStringExpression(this.stringExpr, context.memory);
    const n = evaluateIntegerExpression(this.numExpr, context.memory);
    if (n < 0) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    const output = this.calculate(string, n);
    if (isError(output)) {
      throw RuntimeError.fromToken(this.token, output);
    }
    context.memory.write(this.result.address!, output);
  }

  abstract calculate(str: string, n: number): Value;
}

export class LeftFunction extends LRFunction {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(str: string, n: number): Value {
    return string(str.slice(0, n));
  }
}

export class RightFunction extends LRFunction {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(str: string, n: number): Value {
    return n === 0 ? string('') : string(str.slice(-n));
  }
}

export class MidFunction extends Statement {
  token: Token;
  stringExpr: ExprContext;
  startExpr: ExprContext;
  lengthExpr: ExprContext | undefined;
  result: Variable;

  constructor(
    token: Token,
    stringExpr: ExprContext,
    startExpr: ExprContext,
    lengthExpr: ExprContext | undefined,
    result: Variable) {
    super();
    this.token = token;
    this.stringExpr = stringExpr;
    this.startExpr = startExpr;
    this.lengthExpr = lengthExpr;
    this.result = result;
  }

  override execute(context: ExecutionContext) {
    const str = evaluateStringExpression(this.stringExpr, context.memory);
    const start = evaluateIntegerExpression(this.startExpr, context.memory);
    const length = this.lengthExpr ?
      evaluateIntegerExpression(this.lengthExpr, context.memory) :
      str.length;
    if (start <= 0 || length < 0) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    const value = str.slice(start - 1, (start - 1) + length);
    context.memory.write(this.result.address!, string(value));
  }
}

export class LtrimFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value): Value {
    if (!isString(input)) {
      throw new Error("expecting string");
    }
    return string(input.string.replace(/^ */, ''));
  }
}

export class RtrimFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value): Value {
    if (!isString(input)) {
      throw new Error("expecting string");
    }
    return string(input.string.replace(/ *$/, ''));
  }
}

export class SpaceFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    if (input.number < 0) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    return string(' '.repeat(input.number));
  }
}

export class HexFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    if (input.number <= -32768) {
      return string((0x100000000 + input.number).toString(16).toUpperCase());
    }
    if (input.number < 0) {
      return string((0x10000 + input.number).toString(16).toUpperCase());
    }
    return string(input.number.toString(16).toUpperCase());
  }
}

export class OctFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    if (input.number <= -32768) {
      return string((0x100000000 + input.number).toString(8).toUpperCase());
    }
    if (input.number < 0) {
      return string((0x10000 + input.number).toString(8).toUpperCase());
    }
    return string(input.number.toString(8).toUpperCase());
  }
}

export class StrFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    if (input.tag === TypeTag.SINGLE) {
      return string(input.number.toFixed(6).replace(/([^0])0*$/, '$1'))
    }
    return string(input.number.toString());
  }
}

export class ValFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value): Value {
    if (!isString(input)) {
      throw new Error("expecting string");
    }
    const value = parseNumberFromStringPrefix(input.string);
    if (!value) {
      return cast(double(0), this.result.type);
    }
    return cast(value, this.result.type);
  }
}