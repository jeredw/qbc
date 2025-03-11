import { double, ILLEGAL_FUNCTION_CALL, integer, isError, isNumeric, isString, long, NumericValue, OVERFLOW, single, string, Value } from "../Values.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { BuiltinStatementArgs } from "../Builtins.ts";
import { RuntimeError } from "../Errors.ts";
import { asciiToString, stringToAscii } from "../AsciiChart.ts";
import { TypeTag } from "../Types.ts";
import { ExecutionContext } from "./ExecutionContext.ts";

export class CdblFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return double(input.number);
  }
}

export class CsngFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return single(input.number);
  }
}

export class CintFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return integer(input.number);
  }
}

export class ClngFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    return long(input.number);
  }
}

abstract class BytesToString extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    const bytes = this.getBytes(input);
    return string(asciiToString(bytes));
  }

  abstract getBytes(value: Value): number[];
}

export class MkiFunction extends BytesToString {
  constructor(args: BuiltinStatementArgs) {
    super(args);
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
  constructor(args: BuiltinStatementArgs) {
    super(args);
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
  constructor(args: BuiltinStatementArgs) {
    super(args);
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
  constructor(args: BuiltinStatementArgs) {
    super(args);
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
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override getBytes(input: NumericValue): number[] {
    // inf/nan isn't representable in mbf so overflow is desired.
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

export class MkdmbfFunction extends BytesToString {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override getBytes(input: NumericValue): number[] {
    // inf/nan isn't representable in mbf so overflow is desired.
    const value = double(input.number);
    if (isError(value)) {
      throw RuntimeError.fromToken(this.token, value);
    }
    if (!isNumeric(value)) {
      throw new Error("expecting number");
    }
    if (!isFinite(value.number) || isNaN(value.number)) {
      throw RuntimeError.fromToken(this.token, OVERFLOW);
    }
    // Too-small values get rounded to zero, too-large values overflow.
    try {
      return float64BytesMbf(value.number);
    } catch {
      throw RuntimeError.fromToken(this.token, OVERFLOW);
    }
  }
}

abstract class StringToBytes extends BuiltinFunction1 {
  expectedNumBytes: number;

  constructor(args: BuiltinStatementArgs, expectedNumBytes: number) {
    super(args);
    this.expectedNumBytes = expectedNumBytes;
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
    if (!isString(input)) {
      throw new Error("expecting string");
    }
    if (input.string.length != this.expectedNumBytes) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    const bytes = stringToAscii(input.string);
    return this.getValue(bytes);
  }

  abstract getValue(bytes: number[]): Value;
}

export class CviFunction extends StringToBytes {
  constructor(args: BuiltinStatementArgs) {
    super(args, 2);
  }

  override getValue(bytes: number[]): Value {
    return integer((bytes[1] << 8) | bytes[0]);
  }
}

export class CvlFunction extends StringToBytes {
  constructor(args: BuiltinStatementArgs) {
    super(args, 4);
  }

  override getValue(bytes: number[]): Value {
    return long((bytes[3] << 24) | (bytes[2] << 16) | (bytes[1] << 8) | bytes[0]);
  }
}

export class CvsFunction extends StringToBytes {
  constructor(args: BuiltinStatementArgs) {
    super(args, 4);
  }

  override getValue(bytes: number[]): Value {
    // single normally returns OVERFLOW for inf but cvs can return this.
    return {tag: TypeTag.SINGLE, number: bytesToFloat32(bytes)};
  }
}

export class CvdFunction extends StringToBytes {
  constructor(args: BuiltinStatementArgs) {
    super(args, 8);
  }

  override getValue(bytes: number[]): Value {
    // double normally returns OVERFLOW for inf but cvs can return this.
    return {tag: TypeTag.DOUBLE, number: bytesToFloat64(bytes)};
  }
}

export class CvsmbfFunction extends StringToBytes {
  constructor(args: BuiltinStatementArgs) {
    super(args, 4);
  }

  override getValue(bytes: number[]): Value {
    return single(mbfBytesToFloat32(bytes));
  }
}

export class CvdmbfFunction extends StringToBytes {
  constructor(args: BuiltinStatementArgs) {
    super(args, 8);
  }

  override getValue(bytes: number[]): Value {
    return double(mbfBytesToFloat64(bytes));
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

function mbfBytesToFloat64(bytes: number[]): number {
  const exponent = bytes[7] - 129;  // mantissa is implicitly .1xxxxx
  const sign = bytes[6] & 0x80;
  if (exponent === -129) {
    // 0 exponent -> 0
    return 0;
  }
  // mbf has a 55-bit mantissa while ieee has a 52-bit mantissa, 
  // drop the three least significant bits.
  //        7        6        5        4        3        2        1        0
  // ........|....6666|66655555|55544444|44433333|33322222|22211111|11100000|000
  //                  48       40       32       24       16       8
  return bytesToFloat64([
    ((bytes[1] << 5) & 0xe0) | ((bytes[0] >> 3) & 0x1f),
    ((bytes[2] << 5) & 0xe0) | ((bytes[1] >> 3) & 0x1f),
    ((bytes[3] << 5) & 0xe0) | ((bytes[2] >> 3) & 0x1f),
    ((bytes[4] << 5) & 0xe0) | ((bytes[3] >> 3) & 0x1f),
    ((bytes[5] << 5) & 0xe0) | ((bytes[4] >> 3) & 0x1f),
    ((bytes[6] << 5) & 0xe0) | ((bytes[5] >> 3) & 0x1f),
    ((bytes[6] >> 3) & 0x0f) | (((exponent + 1023) << 4) & 0xf0),
    (((exponent + 1023) >> 4) & 0x7f) | sign
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
  if (exponent === 128) {
    throw new Error("not expecting infinities or nans");
  }
  return [
    bytes[0],
    bytes[1],
    (bytes[2] & 0x7f) | sign,
    exponent + 129  // implicit .1xxxx mantissa in ieee -> 1.xxxx mbf
  ];
}

function float64BytesMbf(f64: number): number[] {
  const bytes = float64Bytes(f64);
  const exponent = (((bytes[7] & 0x7f) << 4) | ((bytes[6] >> 4) & 0xf)) - 1023;
  const sign = bytes[7] & 0x80;
  if (exponent < -128) {
    return [0, 0, 0, 0, 0, 0, 0, 0];
  }
  if (exponent === 1024) {
    throw new Error("not expecting infinities or nans");
  }
  if (exponent + 129 > 255) {
    throw new Error("overflow");
  }
  // 
  // The lower three mbf mantissa bits are always 0.
  //        7        6        5        4        3        2        1        0
  // ........|.6666555|55555444|44444333|33333222|22222111|11111000|00000---|
  //         56       48       40       32       24       16       8
  return [
    (bytes[0] << 3) & 0xf8,
    ((bytes[1] << 3) & 0xf8) | ((bytes[0] >> 5) & 7),
    ((bytes[2] << 3) & 0xf8) | ((bytes[1] >> 5) & 7),
    ((bytes[3] << 3) & 0xf8) | ((bytes[2] >> 5) & 7),
    ((bytes[4] << 3) & 0xf8) | ((bytes[3] >> 5) & 7),
    ((bytes[5] << 3) & 0xf8) | ((bytes[4] >> 5) & 7),
    sign | ((bytes[6] << 3) & 0x78) | ((bytes[5] >> 5) & 7),
    exponent + 129  // implicit .1xxxx mantissa in ieee -> 1.xxxx mbf
  ];
}