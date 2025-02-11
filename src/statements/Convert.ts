import { double, integer, isError, isNumeric, isString, long, NumericValue, single, string, Value } from "../Values.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { BuiltinParams } from "../Builtins.ts";
import { RuntimeError } from "../Errors.ts";
import { asciiToChar, charToAscii } from "../AsciiChart.ts";

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

abstract class BytesToString extends BuiltinFunction1 {
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

export class MkiFunction extends BytesToString {
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

export class MklFunction extends BytesToString {
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

export class MksFunction extends BytesToString {
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
    const bytes = float32Bytes(value.number);
    return Array.from(bytes);
  }
}

export class MkdFunction extends BytesToString {
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
    const bytes = float64Bytes(value.number);
    return Array.from(bytes);
  }
}

abstract class StringToBytes extends BuiltinFunction1 {
  constructor(params: BuiltinParams) {
    super(params);
  }

  override calculate(input: Value): Value {
    if (!isString(input)) {
      throw new Error("expecting string");
    }
    const bytes = input.string.split('').map((char) => {
      const code = charToAscii.get(char);
      if (code === undefined) {
        throw new Error("unmapped character in string");
      }
      return code;
    });
    return this.getValue(bytes);
  }

  abstract getValue(bytes: number[]): Value;
}

export class CviFunction extends StringToBytes {
  constructor(params: BuiltinParams) {
    super(params);
  }

  override getValue(bytes: number[]): Value {
    return integer((bytes[1] << 8) | bytes[0]);
  }
}

export class CvlFunction extends StringToBytes {
  constructor(params: BuiltinParams) {
    super(params);
  }

  override getValue(bytes: number[]): Value {
    return long((bytes[3] << 24) | (bytes[2] << 16) | (bytes[1] << 8) | bytes[0]);
  }
}

export class CvsFunction extends StringToBytes {
  constructor(params: BuiltinParams) {
    super(params);
  }

  override getValue(bytes: number[]): Value {
    return single(bytesToFloat32(bytes));
  }
}

export class CvdFunction extends StringToBytes {
  constructor(params: BuiltinParams) {
    super(params);
  }

  override getValue(bytes: number[]): Value {
    return double(bytesToFloat64(bytes));
  }
}

function bytesToFloat32(bytes: number[]): number {
  const bytes8 = new Uint8Array(bytes);
  const littleEndian = true;
  return new DataView(bytes8.buffer).getFloat32(0, littleEndian);
}

function bytesToFloat64(bytes: number[]): number {
  const bytes8 = new Uint8Array(bytes);
  const littleEndian = true;
  return new DataView(bytes8.buffer).getFloat64(0, littleEndian);
}

function float32Bytes(f32: number): Uint8Array {
  const buffer = new ArrayBuffer(4);
  const littleEndian = true;
  new DataView(buffer).setFloat32(0, f32, littleEndian);
  return new Uint8Array(buffer);
}

function float64Bytes(f64: number): Uint8Array {
  const buffer = new ArrayBuffer(8);
  const littleEndian = true;
  new DataView(buffer).setFloat64(0, f64, littleEndian);
  return new Uint8Array(buffer);
}