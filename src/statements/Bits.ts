import { double, integer, isError, isNumeric, isString, long, NumericValue, single, string, Value } from "../Values.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { BuiltinStatementArgs } from "../Builtins.ts";
import { RuntimeError, ILLEGAL_FUNCTION_CALL, OVERFLOW, IOError } from "../Errors.ts";
import { asciiToString, stringToAscii } from "../AsciiChart.ts";
import { TypeTag } from "../Types.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { getScalarVariableSizeInBytes, Variable } from "../Variables.ts";
import { Statement } from "./Statement.ts";
import { evaluateIntegerExpression, evaluateStringExpression, Expression } from "../Expressions.ts";
import { Memory, readNumber, readString, StorageType } from "../Memory.ts";
import { Token } from "antlr4ng";
import { markArrayBytesDirty, readSubArrayToBytes, writeBytesToSubArray } from "./Arrays.ts";
import { readEntireFile, writeEntireFile } from "./FileSystem.ts";
import { BlitOperation } from "../Drawing.ts";
import * as baked from "../BakedInData.ts";

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
  constructor(args: BuiltinStatementArgs, private expectedNumBytes: number) {
    super(args);
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
    if (!isString(input)) {
      throw new Error("expecting string");
    }
    if (input.string.length < this.expectedNumBytes) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    const bytes = stringToAscii(input.string.slice(0, this.expectedNumBytes));
    return this.getValue(bytes);
  }

  abstract getValue(bytes: number[]): Value;
}

export class CviFunction extends StringToBytes {
  constructor(args: BuiltinStatementArgs) {
    super(args, 2);
  }

  override getValue(bytes: number[]): Value {
    return integer(signExtend16Bit((bytes[1] << 8) | bytes[0]));
  }
}

export class CvlFunction extends StringToBytes {
  constructor(args: BuiltinStatementArgs) {
    super(args, 4);
  }

  override getValue(bytes: number[]): Value {
    // The << operator is already 32-bit signed.
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

export class LenFunction extends Statement {
  constructor(
    private variable: Variable | undefined,
    private stringExpr: Expression | undefined,
    private result: Variable
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    if (this.stringExpr) {
      const str = evaluateStringExpression(this.stringExpr, context.memory);
      context.memory.write(this.result, long(str.length));
      return;
    }
    if (!this.variable) {
      throw new Error("Missing both string expr and variable");
    }
    const size = getScalarVariableSizeInBytes(this.variable, context.memory);
    context.memory.write(this.result, integer(size));
  }
}

export class DefSegStatement extends Statement {
  constructor(
    private token: Token,
    private segmentExpr?: Expression,
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const segment = (
      this.segmentExpr && evaluateIntegerExpression(this.segmentExpr, context.memory, {tag: TypeTag.LONG})
    ) ?? 0;
    if (segment < -65536 || segment > 65535) {
      throw RuntimeError.fromToken(this.token, OVERFLOW);
    }
    context.memory.setSegment(segment);
  }
}

export class SaddFunction extends Statement {
  constructor(
    private token: Token,
    private result: Variable,
    private variable: Variable,
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    context.memory.write(this.result, integer(0));
  }
}

export class VarSegFunction extends Statement {
  constructor(
    private token: Token,
    private result: Variable,
    private variable: Variable,
    private variableSymbol: Variable,
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const index = storePointer(this.variable, this.variableSymbol, context.memory);
    context.memory.write(this.result, integer(index));
  }
}

export class VarPtrStringFunction extends Statement {
  constructor(
    private token: Token,
    private result: Variable,
    private variable: Variable,
    private variableSymbol: Variable,
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const index = storePointer(this.variable, this.variableSymbol, context.memory);
    const pointerBytes = [index & 0xff, (index >> 8) & 0xff, 0, 0];
    context.memory.write(this.result, string(asciiToString(pointerBytes)));
  }
}

function storePointer(variable: Variable, variableSymbol: Variable, memory: Memory): number {
  const [address, _] = memory.dereference(variable);
  // To address array data, QBasic programs have to say e.g. VARSEG(A(1)),
  // because VARSEG(A()) doesn't parse and VARSEG(A) refers to the scalar A.
  // We compile VARSEG(A(1)) as _tmp = reference A(1): VARSEG(_tmp).  The _tmp
  // reference will store the address of A(1), but discards information about
  // the array.  BSAVE and BLOAD need to look up the descriptor to know how
  // big items in A are, so variableSymbol is the actual symbol A().
  const index = variableSymbol.symbolIndex;
  if (index === undefined) {
    throw new Error('No symbol index to use as pointer')
  }
  // Qualify address in case pointers to stack variables are passed to a
  // different procedure.
  const frameIndex = memory.getStackFrameIndex();
  let storedVariable = {...variableSymbol};
  if (variableSymbol.address?.storageType === StorageType.AUTOMATIC &&
      frameIndex >= 0) {
    storedVariable.address = {...variableSymbol.address, frameIndex};
  }
  memory.writePointer(index, address, storedVariable);
  return index;
}

export class VarPtrFunction extends Statement {
  constructor(
    private token: Token,
    private result: Variable,
    private variable: Variable,
    private variableSymbol: Variable,
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const [address, _] = context.memory.dereference(this.variable);
    const offset = address.arrayOffsetInBytes ?? 0;
    context.memory.write(this.result, integer(offset));
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

export function mbfBytesToFloat32(bytes: number[]): number {
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

export function mbfBytesToFloat64(bytes: number[]): number {
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

export function float32Bytes(f32: number): Uint8Array {
  const buffer = new ArrayBuffer(4);
  const littleEndian = true;
  new DataView(buffer).setFloat32(0, f32, littleEndian);
  return new Uint8Array(buffer);
}

export function float64Bytes(f64: number): Uint8Array {
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

export class LsetRecordStatement extends Statement {
  constructor(
    private dest: Variable,
    private source: Variable
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const source = readScalarVariableToBytes(this.source, context.memory);
    const dest = readScalarVariableToBytes(this.dest, context.memory);
    for (let i = 0; i < Math.min(source.length, dest.length); i++) {
      dest[i] = source[i];
    }
    writeBytesToScalarVariable(this.dest, dest, context.memory);
  }
}

export function writeBytesToScalarVariable(variable: Variable, bytes: Uint8Array, memory: Memory, stringsHaveLengthPrefixed?: boolean) {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  writeBytesToElement(variable, data, 0, memory, stringsHaveLengthPrefixed);
}

export function writeBytesToElement(variable: Variable, data: DataView, offset: number, memory: Memory, stringsHaveLengthPrefixed?: boolean): number {
  const type = variable.type;
  switch (type.tag) {
    case TypeTag.INTEGER:
      memory.write(variable, integer(data.getInt16(offset, true)));
      return 2;
    case TypeTag.LONG:
      memory.write(variable, long(data.getInt32(offset, true)));
      return 4;
    case TypeTag.SINGLE: {
      // Do not fround, use the bits we got.
      const value: Value = {tag: TypeTag.SINGLE, number: data.getFloat32(offset, true)};
      memory.write(variable, value);
      return 4;
    }
    case TypeTag.DOUBLE:
      memory.write(variable, double(data.getFloat64(offset, true)));
      return 8;
    case TypeTag.STRING: {
      if (stringsHaveLengthPrefixed) {
        const result = readLengthPrefixedStringFromBuffer(data, offset);
        memory.write(variable, string(result));
        return 2 + result.length;
      }
      const value = memory.read(variable) ?? string("");
      if (!isString(value)) {
        throw new Error("non-string value for string variable");
      }
      const maxLength = value.string.length;
      memory.write(variable, string(readStringFromBuffer(data, offset, maxLength)));
      return maxLength;
    }
    case TypeTag.FIXED_STRING:
      memory.write(variable, string(readStringFromBuffer(data, offset, type.maxLength)));
      return type.maxLength;
    case TypeTag.RECORD:
      let length = 0;
      for (const {name} of type.elements) {
        const element = variable.elements?.get(name);
        if (!element) {
          throw new Error('missing type element');
        }
        length += writeBytesToElement(element, data, offset + length, memory);
      }
      return length;
  }
  throw new Error('unsupported record field')
}

function readLengthPrefixedStringFromBuffer(data: DataView, offset: number): string {
  const length = data.getUint16(offset, true);
  const codes: number[] = [];
  for (let i = 0; i < length; i++) {
    codes.push(data.getUint8(offset + 2 + i) ?? 0);
  }
  return asciiToString(codes);
}

function readStringFromBuffer(data: DataView, offset: number, maxLength: number): string {
  const codes = Array(maxLength).fill(0);
  for (let i = 0; i < maxLength && offset + i < data.byteLength; i++) {
    codes[i] = data.getUint8(offset + i);
  }
  return asciiToString(codes);
}

export function readVariableToBytes(variable: Variable, memory: Memory): Uint8Array {
  return variable.array ?
    readSubArrayToBytes(variable, memory) :
    readScalarVariableToBytes(variable, memory);
}

export function readScalarVariableToBytes(variable: Variable, memory: Memory, stringsHaveLengthPrefixed?: boolean): Uint8Array {
  const size = getScalarVariableSizeInBytes(variable, memory, stringsHaveLengthPrefixed);
  const buffer = new ArrayBuffer(size);
  const data = new DataView(buffer);
  readElementToBytes(data, 0, variable, memory, stringsHaveLengthPrefixed);
  return new Uint8Array(buffer);
}

export function readElementToBytes(data: DataView, offset: number, variable: Variable, memory: Memory, stringsHaveLengthPrefixed?: boolean): number {
  const type = variable.type;
  switch (type.tag) {
    case TypeTag.INTEGER:
      data.setInt16(offset, readNumber(memory, variable), true);
      return 2;
    case TypeTag.LONG:
      data.setInt32(offset, readNumber(memory, variable), true);
      return 4;
    case TypeTag.SINGLE:
      data.setFloat32(offset, readNumber(memory, variable), true);
      return 4;
    case TypeTag.DOUBLE:
      data.setFloat64(offset, readNumber(memory, variable), true);
      return 8;
    case TypeTag.STRING: {
      const value = readString(memory, variable);
      if (stringsHaveLengthPrefixed) {
        data.setInt16(offset, value.length, true);
        copyString(data, offset + 2, value);
        return 2 + value.length;
      }
      copyString(data, offset, value);
      return value.length;
    }
    case TypeTag.FIXED_STRING:
      return copyStringWithPadding(data, offset, readString(memory, variable), type.maxLength);
    case TypeTag.RECORD:
      let length = 0;
      for (const {name} of type.elements) {
        const element = variable.elements?.get(name);
        if (!element) {
          throw new Error('missing type element');
        }
        length += readElementToBytes(data, offset + length, element, memory);
      }
      return length;
  }
  throw new Error('unsupported record field')
}

function copyString(data: DataView, offset: number, string: string) {
  const ascii = stringToAscii(string);
  for (let i = 0; i < ascii.length; i++) {
    data.setUint8(offset + i, ascii[i]);
  }
}

function copyStringWithPadding(data: DataView, offset: number, string: string, maxLength: number): number {
  const ascii = stringToAscii(string);
  for (let i = 0; i < maxLength; i++) {
    data.setUint8(offset + i, ascii[i] ?? 32);
  }
  return maxLength;
}

export class BloadStatement extends Statement {
  private token: Token;
  private pathExpr: Expression;
  private offsetExpr?: Expression;

  constructor({token, params}: BuiltinStatementArgs) {
    super();
    this.token = token;
    this.pathExpr = params[0].expr!;
    this.offsetExpr = params[1].expr;
  }

  override execute(context: ExecutionContext) {
    const path = evaluateStringExpression(this.pathExpr, context.memory);
    const offset = (this.offsetExpr && (evaluateIntegerExpression(this.offsetExpr, context.memory) & 0xffff)) ?? 0;
    try {
      const data = readEntireFile(context, path);
      if (data.length < 7) {
        throw new Error('bsave header missing');
      }
      if (data[0] != 0xfd) {
        throw new Error('bad signature for bsave header');
      }
      const storedSegment = (data[2] << 8) | data[1];
      const length = (data[6] << 8) | data[5];
      const newData = new Uint8Array(data.slice(7));
      if (newData.buffer.byteLength !== length) {
        throw new Error('bad length in bsave header');
      }
      const segment = context.memory.getSegment() & 0xffff;
      if (isVideoMemoryAddress(segment) || (!this.offsetExpr && isVideoMemoryAddress(storedSegment))) {
        // Assume we are trying to BLOAD a full width bitmap into video memory.
        const mode = context.devices.screen.getMode();
        let [width, height] = mode.geometry[0].dots;
        // Allow loading less than the full screen height because some programs load
        // partial spritesheet bitmaps to save time GET'ing sprites.
        height = ~~(length / width);
        const bppPerPlane = mode.bppPerPlane;
        // Prepend a fake bitmap header like PUT assumes.
        const bitmap = new Uint8Array([
          (width * bppPerPlane) & 0xff, ((width * bppPerPlane) >> 8) & 0xff,
          height & 0xff, (height >> 8) & 0xff,
          ...newData
        ]);
        const base = (
          isVideoMemoryAddress(segment) ?
          videoMemoryOffset(segment) :
          videoMemoryOffset(storedSegment)
        );
        context.devices.screen.putBitmap({
          x1: 0,
          y1: ~~(base / width),
          step: false,
          operation: BlitOperation.PSET,
          data: bitmap,
        });
        // The VGA maps 64k but only uses 64000 bytes, and some programs use the
        // extra space for auxiliary data like palettes.
        if (length > mode.pageSize) {
          context.devices.screen.setExtraFrameBufferData(newData.subarray(mode.pageSize));
        }
        return;
      }
      if (offset === 0) {
        const { variable } = context.memory.readPointer(segment);
        writeBytesToVariable(variable, newData, context.memory);
      } else {
        const [variable, variableData] = readBytesAtPointer(segment, context.memory);
        if (offset < variableData.length) {
          for (let i = 0; i < newData.length && offset + i < variableData.length; i++) {
            variableData[offset + i] = newData[i];
          }
          writeBytesToVariable(variable, variableData, context.memory);
        }
      }
    } catch (e: unknown) {
      if (e instanceof IOError) {
        throw RuntimeError.fromToken(this.token, e.error);
      }
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
  }
}

export class BsaveStatement extends Statement {
  private token: Token;
  private pathExpr: Expression;
  private offsetExpr: Expression;
  private lengthExpr: Expression;

  constructor({token, params}: BuiltinStatementArgs) {
    super();
    this.token = token;
    this.pathExpr = params[0].expr!;
    this.offsetExpr = params[1].expr!;
    this.lengthExpr = params[2].expr!;
  }

  override execute(context: ExecutionContext) {
    const path = evaluateStringExpression(this.pathExpr, context.memory);
    const length = evaluateIntegerExpression(this.lengthExpr, context.memory, {tag: TypeTag.LONG}) & 0xffff;
    const offset = evaluateIntegerExpression(this.offsetExpr, context.memory) & 0xffff;
    try {
      const segment = context.memory.getSegment() & 0xffff;
      const [_, bytes] = readBytesAtPointer(segment, context.memory);
      const data = new Uint8Array(length);
      data.set(new Uint8Array(bytes.slice(offset, offset + length)));
      const file = [0xfd, 0, 0, 0, 0, length & 0xff, (length >> 8) & 0xff, ...data];
      writeEntireFile(context, path, Array.from(file));
    } catch (e: unknown) {
      if (e instanceof IOError) {
        throw RuntimeError.fromToken(this.token, e.error);
      }
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
  }
}

export class PeekStatement extends Statement {
  private token: Token;
  private offsetExpr: Expression;
  private result: Variable;

  constructor({token, params, result}: BuiltinStatementArgs) {
    super();
    this.token = token;
    this.offsetExpr = params[0].expr!;
    this.result = result!;
  }

  override execute(context: ExecutionContext) {
    const offset = evaluateIntegerExpression(this.offsetExpr, context.memory, { tag: TypeTag.LONG });
    if (offset < -65536 || offset > 65535) {
      throw RuntimeError.fromToken(this.token, OVERFLOW);
    }
    const segment = context.memory.getSegment() & 0xffff;
    try {
      const [_, data] = readBytesAtPointer(segment, context.memory);
      context.memory.write(this.result, integer(data[offset] ?? 0));
      return;
    } catch (e: unknown) {
    }
    let data = 0;
    if (segment === baked.SBMIDI_SEGMENT) {
      // Map some fake data used to detect MIDI drivers.
      data = (
        offset >= 271 ?
        stringToAscii("SBMIDI")[offset - 271] :
        baked.SBMIDI_BYTES[offset]
      ) ?? 0;
    } else if (segment === baked.SBSIM_SEGMENT) {
      data = (
        offset >= 274 ?
        stringToAscii("SBSIM")[offset - 274] :
        baked.SBSIM_BYTES[offset]
      ) ?? 0;
    } else if (segment === baked.ROM_FONT_SEGMENT) {
      data = baked.ROM_FONT_BYTES[offset - 0xe] ?? 0;
    } else if (isVideoMemoryAddress(segment)) {
      const mode = context.devices.screen.getMode();
      if (mode.mode !== 13) {
        throw new Error('Only support PEEKing video memory in mode 13');
      }
      const base = videoMemoryOffset(segment);
      const unsignedOffset = base + (offset & 0xffff);
      if (unsignedOffset >= mode.pageSize) {
        const extraData = context.devices.screen.getExtraFrameBufferData();
        data = extraData[unsignedOffset - mode.pageSize];
      } else {
        const y = ~~(unsignedOffset / 320);
        const x = ~~(unsignedOffset % 320);
        data = context.devices.screen.getPixel(x, y, /*screen=*/ true);
      }
    } else if (segment === 0xb800) {
      const mode = context.devices.screen.getMode();
      if (mode.mode !== 0) {
        throw new Error('Only support PEEKing text mode memory in mode 0');
      }
      const cellAddress = offset >> 1;
      const row = ~~(cellAddress / 80) + 1;
      const column = ~~(cellAddress % 80) + 1;
      if ((offset & 1) === 0) {
        const char = context.devices.screen.getCharAt(row, column);
        data = stringToAscii(char)[0] ?? 0;
      } else {
        data = context.devices.screen.getAttributeAt(row, column);
      }
    } else {
      const linearAddress = (segment << 4) | offset;
      switch (linearAddress) {
        // Some programs check for mouse support by peeking to see if there is
        // an int 33h handler, so pretend there is.
        case 0xcc:
        case 0xcd:
        case 0xce:
        case 0xcf:
          data = 1;
          break;
        case 0x410:
          data = 38;  // donkey.bas checks the BIOS equipment byte.
          break;
        case 0x417:
          data = context.devices.keyboard.getShiftStatus();
          break;
        case 0x418:
          data = context.devices.keyboard.getExtendedShiftStatus();
          break;
        case 0x44a: {
          const geometry = context.devices.screen.getGeometry();
          const [columns, _] = geometry.text;
          data = columns;
          break;
        }
        case 0x46c:
          data = context.devices.timer.rawTicks() & 0xff;
          break;
        case 0x46d:
          data = (context.devices.timer.rawTicks() >> 8) & 0xff;
          break;
      }
    }
    context.memory.write(this.result, integer(data));
  }
}

export class PokeStatement extends Statement {
  private token: Token;
  private offsetExpr: Expression;
  private valueExpr: Expression;

  constructor({token, params}: BuiltinStatementArgs) {
    super();
    this.token = token;
    this.offsetExpr = params[0].expr!;
    this.valueExpr = params[1].expr!;
  }

  override execute(context: ExecutionContext) {
    const offset = evaluateIntegerExpression(this.offsetExpr, context.memory, { tag: TypeTag.LONG });
    if (offset < -65536 || offset > 65535) {
      throw RuntimeError.fromToken(this.token, OVERFLOW);
    }
    const byte = evaluateIntegerExpression(this.valueExpr, context.memory) & 255;
    const segment = context.memory.getSegment() & 0xffff;
    if (isVideoMemoryAddress(segment)) {
      const mode = context.devices.screen.getMode();
      if (mode.mode !== 13) {
        throw new Error('Only support POKEing video memory in mode 13');
      }
      const base = videoMemoryOffset(segment);
      const unsignedOffset = base + (offset & 0xffff);
      if (unsignedOffset >= mode.pageSize) {
        const extraData = context.devices.screen.getExtraFrameBufferData();
        extraData[unsignedOffset - mode.pageSize] = byte;
      } else {
        const y = ~~(unsignedOffset / 320);
        const x = ~~(unsignedOffset % 320);
        context.devices.screen.setPixel(x, y, byte, /*step=*/ false, /*screen=*/ true);
      }
      return;
    }
    if (segment === 0xb800) {
      const mode = context.devices.screen.getMode();
      if (mode.mode !== 0) {
        throw new Error('Only support POKEing text mode memory in mode 0');
      }
      const cellOffset = offset >> 1;
      const row = ~~(cellOffset / 80) + 1;
      const column = ~~(cellOffset % 80) + 1;
      if ((offset & 1) === 0) {
        context.devices.screen.setCharAt(row, column, asciiToString([byte])[0] ?? ' ');
      } else {
        context.devices.screen.setAttributeAt(row, column, byte);
      }
      return;
    }
    try {
      const [variable, data] = readBytesAtPointer(segment, context.memory);
      if (offset < data.length) {
        data[offset] = byte;
        if (variable.array) {
          // No need to copy back entire array, just mark bytes dirty.
          markArrayBytesDirty(variable, context.memory);
        } else {
          writeBytesToVariable(variable, data, context.memory);
        }
      }
    } catch (e: unknown) {
    }
  }
}

function readBytesAtPointer(pointer: number, memory: Memory): [Variable, Uint8Array] {
  const {variable} = memory.readPointer(pointer);
  const bytes = readVariableToBytes(variable, memory);
  return [variable, bytes];
}

export function writeBytesToVariable(variable: Variable, data: Uint8Array, memory: Memory) {
  if (variable.array) {
    writeBytesToSubArray(variable, data, memory);
  } else {
    writeBytesToScalarVariable(variable, data, memory);
  }
}

export class FreFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, _context: ExecutionContext): Value {
    return long(262144);
  }
}

export function signExtend16Bit(x: number) {
  return (x ^ 0x8000) - 0x8000;
}

function isVideoMemoryAddress(segment: number) {
  return segment >= 0xa000 && segment < 0xb000;
}

function videoMemoryOffset(segment: number) {
  return (segment - 0xa000) * 16;
}