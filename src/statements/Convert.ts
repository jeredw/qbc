import { double, integer, isError, isNumeric, isString, long, NumericValue, OVERFLOW, single, string, Value } from "../Values.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { BuiltinParams } from "../Builtins.ts";
import { RuntimeError } from "../Errors.ts";
import { asciiToChar, charToAscii } from "../AsciiChart.ts";
import { TypeTag } from "../Types.ts";

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
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    // single() normally returns OVERFLOW for inf but mks$ can output it.
    const value = input.tag == TypeTag.DOUBLE ? Math.fround(input.number) : input.number;
    const bytes = float32Bytes(value);
    return Array.from(bytes);
  }
}

export class MkdFunction extends BytesToString {
  constructor(params: BuiltinParams) {
    super(params);
  }

  override getBytes(input: NumericValue): number[] {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    // double() normally returns OVERFLOW for inf but mkd$ can output it.
    const bytes = float64Bytes(input.number);
    return Array.from(bytes);
  }
}

export class MksmbfFunction extends BytesToString {
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
    if (!isFinite(value.number) || isNaN(value.number)) {
      throw RuntimeError.fromToken(this.token, OVERFLOW);
    }
    return float32BytesMbf(value.number);
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
    // single normally returns OVERFLOW for inf but cvs can return this.
    return {tag: TypeTag.SINGLE, number: bytesToFloat32(bytes)};
  }
}

export class CvdFunction extends StringToBytes {
  constructor(params: BuiltinParams) {
    super(params);
  }

  override getValue(bytes: number[]): Value {
    // double normally returns OVERFLOW for inf but cvs can return this.
    return {tag: TypeTag.DOUBLE, number: bytesToFloat64(bytes)};
  }
}

export class CvsmbfFunction extends StringToBytes {
  constructor(params: BuiltinParams) {
    super(params);
  }

  override getValue(bytes: number[]): Value {
    return single(mbfBytesToFloat32(bytes));
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

function mbfBytesToFloat32(bytes: number[]): number {
  const exponent = bytes[3] - 129;  // mantissa is implicitly .1xxxxx
  const sign = bytes[2] & 0x80;
  if (exponent + 127 < 1) {
    // ieee uses a 0 exponent for denorms so mbf exponents < 3 convert to 0.
    return 0;
  }
  return bytesToFloat32([
    bytes[0],
    bytes[1],
    (bytes[2] & 0x7f) | (((exponent + 127) << 7) & 0x80),
    (((exponent + 127) >> 1) & 0x7f) | sign
  ])
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

function float32BytesMbf(f32: number): number[] {
  const bytes = float32Bytes(f32);
  const exponent = (((bytes[3] & 0x7f) << 1) | ((bytes[2] >> 7) & 1)) - 127;
  const sign = bytes[3] & 0x80;
  if (exponent === -127) {
    return [0, 0, 0, 0];
  }
  if (exponent === 255) {
    throw new Error("not expecting infinities or nans");
  }
  return [
    bytes[0],
    bytes[1],
    (bytes[2] & 0x7f) | sign,
    exponent + 129  // implicit .1xxxx mantissa in ieee -> 1.xxxx mbf
  ];
}