import { double, integer, isError, isNumeric, long, NumericValue, single, string, Value } from "../Values.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { BuiltinParams } from "../Builtins.ts";
import { RuntimeError } from "../Errors.ts";
import { asciiToChar } from "../AsciiChart.ts";

export class CdblFunction extends BuiltinFunction1 {
  constructor(params: BuiltinParams) {
    super(params);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return double(input.number);
  }
}

export class CsngFunction extends BuiltinFunction1 {
  constructor(params: BuiltinParams) {
    super(params);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return single(input.number);
  }
}

export class CintFunction extends BuiltinFunction1 {
  constructor(params: BuiltinParams) {
    super(params);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return integer(input.number);
  }
}

export class ClngFunction extends BuiltinFunction1 {
  constructor(params: BuiltinParams) {
    super(params);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return long(input.number);
  }
}

abstract class BitsToString extends BuiltinFunction1 {
  constructor(params: BuiltinParams) {
    super(params);
  }

  override calculate(input: Value): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    const bytes = this.getBytes(input);
    return string(bytes.map((code) => asciiToChar.get(code)).join(''));
  }

  abstract getBytes(value: Value): number[];
}

export class MkiFunction extends BitsToString {
  constructor(params: BuiltinParams) {
    super(params);
  }

  override getBytes(input: NumericValue): number[] {
    const value = integer(input.number);
    if (isError(value)) {
      throw RuntimeError.fromToken(this.token, value);
    }
    if (!isNumeric(value)) {
      throw new Error("expecting number");
    }
    const bits = value.number;
    return [
      bits & 0xff,
      (bits >> 8) & 0xff
    ];
  }
}

export class MklFunction extends BitsToString {
  constructor(params: BuiltinParams) {
    super(params);
  }

  override getBytes(input: NumericValue): number[] {
    const value = long(input.number);
    if (isError(value)) {
      throw RuntimeError.fromToken(this.token, value);
    }
    if (!isNumeric(value)) {
      throw new Error("expecting number");
    }
    const bits = value.number;
    return [
      bits & 0xff,
      (bits >> 8) & 0xff,
      (bits >> 16) & 0xff,
      (bits >> 24) & 0xff,
    ];
  }
}

export class MksFunction extends BitsToString {
  constructor(params: BuiltinParams) {
    super(params);
  }

  override getBytes(input: NumericValue): number[] {
    const value = single(input.number);
    if (isError(value)) {
      throw RuntimeError.fromToken(this.token, value);
    }
    if (!isNumeric(value)) {
      throw new Error("expecting number");
    }
    const bits = float32Bits(value.number);
    return [
      bits & 0xff,
      (bits >> 8) & 0xff,
      (bits >> 16) & 0xff,
      (bits >> 24) & 0xff,
    ];
  }
}

export class MkdFunction extends BitsToString {
  constructor(params: BuiltinParams) {
    super(params);
  }

  override getBytes(input: NumericValue): number[] {
    const value = double(input.number);
    if (isError(value)) {
      throw RuntimeError.fromToken(this.token, value);
    }
    if (!isNumeric(value)) {
      throw new Error("expecting number");
    }
    const bits = float64Bits(value.number);
    return [
      bits[0] & 0xff,
      (bits[0] >> 8) & 0xff,
      (bits[0] >> 16) & 0xff,
      (bits[0] >> 24) & 0xff,
      bits[1] & 0xff,
      (bits[1] >> 8) & 0xff,
      (bits[1] >> 16) & 0xff,
      (bits[1] >> 24) & 0xff,
    ];
  }
}

function float32Bits(f32: number): number {
  const buf = new ArrayBuffer(4);
  (new Float32Array(buf))[0] = f32;
  return (new Uint32Array(buf))[0];
}

function float64Bits(f64: number): number[] {
  const buf = new ArrayBuffer(8);
  (new Float64Array(buf))[0] = f64;
  return [(new Uint32Array(buf))[0], (new Uint32Array(buf))[1]];
}