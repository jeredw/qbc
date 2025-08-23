import { cast, double, numericTypeOf, isNumeric, single, Value, getDefaultValue } from "../Values.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { BuiltinStatementArgs } from "../Builtins.ts";
import { RuntimeError, ILLEGAL_FUNCTION_CALL } from "../Errors.ts";
import { TypeTag } from "../Types.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";
import { Variable } from "../Variables.ts";
import { evaluateIntegerExpression, Expression } from "../Expressions.ts";
import { float32Bytes, float64Bytes } from "./Bits.ts";

export class AbsFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
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

  override calculate(input: Value, _context: ExecutionContext): Value {
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

  override calculate(input: Value, _context: ExecutionContext): Value {
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

  override calculate(input: Value, _context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return cast(double(Math.exp(input.number)), this.result.type);
  }
}

export class LogFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    if (input.number <= 0) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    return cast(double(Math.log(input.number)), this.result.type);
  }
}

export class SgnFunction extends BuiltinFunction1 {
  constructor(params: BuiltinStatementArgs) {
    super(params);
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return numericTypeOf(input)(input.number < 0 ? -1 : input.number === 0 ? 0 : 1);
  }
}

export class SinFunction extends BuiltinFunction1 {
  constructor(params: BuiltinStatementArgs) {
    super(params);
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return cast(double(Math.sin(input.number)), this.result.type);
  }
}

export class SqrFunction extends BuiltinFunction1 {
  constructor(params: BuiltinStatementArgs) {
    super(params);
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    if (input.number < 0) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    return cast(double(Math.sqrt(input.number)), this.result.type);
  }
}

export class TanFunction extends BuiltinFunction1 {
  constructor(params: BuiltinStatementArgs) {
    super(params);
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return cast(double(Math.tan(input.number)), this.result.type);
  }
}

export class FixFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return numericTypeOf(input)(Math.trunc(input.number));
  }
}

export class IntFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return numericTypeOf(input)(Math.floor(input.number));
  }
}

export class RandomizeStatement extends Statement {
  constructor(private seed?: Expression, private variable?: Variable) {
    super();
  }

  override execute(context: ExecutionContext) {
    const seed = this.getSeed(context);
    const bytes = float64Bytes(seed);
    // https://nullprogram.com/blog/2020/11/17/
    const exponent = (bytes[7] << 16) | (bytes[6] << 8);
    const mantissa = (bytes[5] << 16) | (bytes[4] << 8);
    const bug = context.random.state & 0xff;
    const seedBits = (exponent ^ mantissa) | bug;
    context.random.setSeed(seedBits);
  }

  private getSeed(context: ExecutionContext): number {
    if (this.seed) {
      return evaluateIntegerExpression(this.seed, context.memory, { tag: TypeTag.DOUBLE });
    }
    if (!this.variable) {
      throw new Error("expecting either seed or variable");
    }
    const value = context.memory.read(this.variable) ?? getDefaultValue(this.variable);
    if (!isNumeric(value)) {
      throw new Error("expecting numeric value for seed");
    }
    return value.number;
  }
}

export class RndFunction extends Statement {
  result: Variable;
  n?: Expression;

  constructor({result, params}: BuiltinStatementArgs) {
    super();
    this.result = result!;
    if (params.length > 0 && params[0].expr) {
      this.n = params[0].expr;
    }
  }

  override execute(context: ExecutionContext) {
    const n = (this.n && evaluateIntegerExpression(this.n, context.memory)) ?? 1;
    if (n < 0) {
      // https://nullprogram.com/blog/2020/11/17/
      const bytes = float32Bytes(n);
      const seed = (bytes[2] << 16) | (bytes[1] << 8) | bytes[0] | bytes[3];
      context.random.setSeed(seed);
    }
    const advance = n != 0;
    const value = context.random.getRandom(advance);
    context.memory.write(this.result, single(value));
  }
}