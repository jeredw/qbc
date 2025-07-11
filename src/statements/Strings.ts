import { Value, cast, double, integer, isError, isNumeric, isString, string } from "../Values.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { BuiltinStatementArgs } from "../Builtins.ts";
import { asciiToChar, asciiToString, charToAscii, stringToAscii } from "../AsciiChart.ts";
import { ExprContext } from "../../build/QBasicParser.ts";
import { Token } from "antlr4ng";
import { Variable } from "../Variables.ts";
import { evaluateExpression, evaluateIntegerExpression, evaluateStringExpression, parseNumberFromStringPrefix } from "../Expressions.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";
import { RuntimeError, ILLEGAL_FUNCTION_CALL, TYPE_MISMATCH } from "../Errors.ts";
import { TypeTag } from "../Types.ts";
import { updateRecordBuffer } from "./FileSystem.ts";
import { roundToNearestEven } from "../Math.ts";

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

export class ChrFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    const code = roundToNearestEven(input.number);
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

export class LcaseFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
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

  override calculate(input: Value, _context: ExecutionContext): Value {
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
    context.memory.write(this.result, output);
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
  constructor(
    private token: Token,
    private stringExpr: ExprContext,
    private startExpr: ExprContext,
    private lengthExpr: ExprContext | undefined,
    private result: Variable
  ) {
    super();
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
    context.memory.write(this.result, string(value));
  }
}

export class MidStatement extends Statement {
  constructor(
    private token: Token,
    private variable: Variable,
    private startExpr: ExprContext,
    private lengthExpr: ExprContext | undefined,
    private stringExpr: ExprContext,
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const value = context.memory.read(this.variable) ?? string("");
    if (!isString(value)) {
      throw RuntimeError.fromToken(this.token, TYPE_MISMATCH);
    }
    const start = evaluateIntegerExpression(this.startExpr, context.memory);
    const fullMid = evaluateStringExpression(this.stringExpr, context.memory);
    const midLength = this.lengthExpr ?
      Math.min(fullMid.length, evaluateIntegerExpression(this.lengthExpr, context.memory)) :
      fullMid.length;
    if (start <= 0 || midLength < 0) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    const origLength = value.string.length;
    if (start > origLength) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    const [left, mid, right] = [
      value.string.slice(0, start - 1),
      fullMid.slice(0, midLength),
      value.string.slice(start - 1 + midLength)
    ];
    value.string = (left + mid + right).slice(0, origLength);
    updateRecordBuffer(value);
    context.memory.write(this.variable, value);
  }
}

abstract class JustifyStringStatement extends Statement {
  constructor(
    private token: Token,
    private variable: Variable,
    private stringExpr: ExprContext
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const value = context.memory.read(this.variable) ?? string("");
    if (!isString(value)) {
      throw RuntimeError.fromToken(this.token, TYPE_MISMATCH);
    }
    const fieldWidth = value.string.length;
    const insert = evaluateStringExpression(this.stringExpr, context.memory);
    value.string = this.justify(insert, fieldWidth);
    updateRecordBuffer(value);
    context.memory.write(this.variable, value);
  }

  abstract justify(string: string, width: number): string;
}

export class LsetStringStatement extends JustifyStringStatement {
  constructor(token: Token, variable: Variable, stringExpr: ExprContext) {
    super(token, variable, stringExpr);
  }

  override justify(string: string, width: number): string {
    return string.slice(0, width).padEnd(width);
  }
}

export class RsetStringStatement extends JustifyStringStatement {
  constructor(token: Token, variable: Variable, stringExpr: ExprContext) {
    super(token, variable, stringExpr);
  }

  override justify(string: string, width: number): string {
    return string.slice(0, width).padStart(width);
  }
}

export class LtrimFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
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

  override calculate(input: Value, _context: ExecutionContext): Value {
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

  override calculate(input: Value, _context: ExecutionContext): Value {
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

  override calculate(input: Value, _context: ExecutionContext): Value {
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

  override calculate(input: Value, _context: ExecutionContext): Value {
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

  override calculate(input: Value, _context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    const sign = input.number < 0 ? "" : " ";
    if (input.tag === TypeTag.SINGLE) {
      return string(sign + input.number.toFixed(6).replace(/([^0])0*$/, '$1').replace(/\.$/, ''));
    }
    return string(sign + input.number.toString());
  }
}

export class StringFunction extends Statement {
  token: Token;
  result: Variable;
  length: ExprContext;
  asciiCodeOrString: ExprContext;

  constructor({token, result, params}: BuiltinStatementArgs) {
    super();
    this.token = token;
    if (!result) {
      throw new Error("missing result");
    }
    this.result = result;
    if (!params[0] || !params[0].expr) {
      throw new Error("missing length arg");
    }
    this.length = params[0].expr;
    if (!params[1] || !params[1].expr) {
      throw new Error("missing string arg");
    }
    this.asciiCodeOrString = params[1].expr;
  }

  override execute(context: ExecutionContext) {
    const length = evaluateIntegerExpression(this.length, context.memory);
    if (length < 0) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    const asciiCodeOrString = evaluateExpression({
      expr: this.asciiCodeOrString,
      memory: context.memory
    });
    const char = this.getCharacterToRepeat(asciiCodeOrString);
    context.memory.write(this.result, string(char.repeat(length)));
  }

  private getCharacterToRepeat(value: Value): string {
    if (isError(value)) {
      throw RuntimeError.fromToken(this.token, value);
    }
    if (isNumeric(value)) {
      const code = integer(value.number);
      if (isError(code)) {
        throw RuntimeError.fromToken(this.token, code);
      }
      if (!isNumeric(code)) {
        throw RuntimeError.fromToken(this.token, TYPE_MISMATCH);
      }
      const char = asciiToChar.get(code.number & 0xff);
      if (!char) {
        throw new Error('unmapped character');
      }
      return char;
    }
    if (isString(value)) {
      const char = value.string.at(0);
      if (char === undefined) {
        throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
      }
      return char;
    }
    throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
  }
}

export class ValFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
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

export class InstrFunction extends Statement {
  constructor(
    private token: Token,
    private start: ExprContext | undefined,
    private haystack: ExprContext,
    private needle: ExprContext,
    private result: Variable
  ) {
    super()
  }

  override execute(context: ExecutionContext) {
    const start = this.start ? evaluateIntegerExpression(this.start, context.memory) : 1;
    const haystack = evaluateStringExpression(this.haystack, context.memory);
    const needle = evaluateStringExpression(this.needle, context.memory);
    if (start < 1 || start > 32767) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    const position = haystack.indexOf(needle, start - 1);
    // -1 -> 0 means not found, other indices are also 1-based.
    context.memory.write(this.result, integer(position + 1));
  }
}