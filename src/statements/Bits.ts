import { double, integer, isError, isNumeric, isString, long, NumericValue, single, string, Value } from "../Values.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { BuiltinStatementArgs } from "../Builtins.ts";
import { RuntimeError, ILLEGAL_FUNCTION_CALL, OVERFLOW, IOError } from "../Errors.ts";
import { asciiToString, stringToAscii } from "../AsciiChart.ts";
import { TypeTag } from "../Types.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { getScalarVariableSizeInBytes, Variable } from "../Variables.ts";
import { ExprContext } from "../../build/QBasicParser.ts";
import { Statement } from "./Statement.ts";
import { evaluateIntegerExpression, evaluateStringExpression } from "../Expressions.ts";
import { Memory } from "../Memory.ts";
import { Token } from "antlr4ng";
import { readBytesFromArray, writeBytesToArray } from "./Arrays.ts";
import { readEntireFile, writeEntireFile } from "./FileSystem.ts";
import { BlitOperation } from "../Drawing.ts";

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

export class LenStatement extends Statement {
  constructor(
    private variable: Variable | undefined,
    private stringExpr: ExprContext | undefined,
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
      throw new Error("missing both string expr and variable");
    }
    const size = getScalarVariableSizeInBytes(this.variable, context.memory);
    context.memory.write(this.result, long(size));
  }
}

export class DefSegStatement extends Statement {
  constructor(
    private token: Token,
    private segmentExpr?: ExprContext,
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
    const [address, _] = context.memory.dereference(this.variable);
    // To address array data, QBasic programs have to say e.g. VARSEG(A(1)),
    // because VARSEG(A()) doesn't parse and VARSEG(A) refers to the scalar A.
    // We compile VARSEG(A(1)) as _tmp = reference A(1): VARSEG(_tmp).  The _tmp
    // reference will store the address of A(1), but discards information about
    // the array.  BSAVE and BLOAD need to look up the descriptor to know how
    // big items in A are, so variableSymbol is the actual symbol A().
    const index = this.variableSymbol.symbolIndex;
    if (index === undefined) {
      throw new Error('No symbol index to use as VARSEG pointer')
    }
    context.memory.writePointer(index, address, this.variableSymbol);
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
    const [address, _] = context.memory.dereference(this.variable);
    const index = this.variable.symbolIndex;
    if (index === undefined) {
      throw new Error('No symbol index to use as VARPTR$ pointer')
    }
    context.memory.writePointer(index, address, this.variableSymbol);
    const pointerBytes = [index & 0xff, (index >> 8) & 0xff, 0, 0];
    context.memory.write(this.result, string(asciiToString(pointerBytes)));
  }
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
    const sourceBuffer = readVariableToBytes(this.source, context.memory);
    const destBuffer = readVariableToBytes(this.dest, context.memory);
    const source = new Uint8Array(sourceBuffer);
    const dest = new Uint8Array(destBuffer);
    for (let i = 0; i < Math.min(source.length, dest.length); i++) {
      dest[i] = source[i];
    }
    writeBytesToVariable(this.dest, destBuffer, context.memory);
  }
}

export function writeBytesToVariable(variable: Variable, buffer: ArrayBuffer, memory: Memory, stringsHaveLengthPrefixed?: boolean) {
  const data = new DataView(buffer);
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
  const codes: number[] = [];
  for (let i = 0; i < maxLength; i++) {
    codes.push(data.getUint8(offset + i) ?? 32);
  }
  return asciiToString(codes);
}

export function readVariableToBytes(variable: Variable, memory: Memory, stringsHaveLengthPrefixed?: boolean): ArrayBuffer {
  const size = getScalarVariableSizeInBytes(variable, memory, stringsHaveLengthPrefixed);
  const buffer = new ArrayBuffer(size);
  const data = new DataView(buffer);
  readElementToBytes(data, 0, variable, memory, stringsHaveLengthPrefixed);
  return buffer;
}

export function readElementToBytes(data: DataView, offset: number, variable: Variable, memory: Memory, stringsHaveLengthPrefixed?: boolean): number {
  const type = variable.type;
  switch (type.tag) {
    case TypeTag.INTEGER:
      data.setInt16(offset, readNumber(variable, memory), true);
      return 2;
    case TypeTag.LONG:
      data.setInt32(offset, readNumber(variable, memory), true);
      return 4;
    case TypeTag.SINGLE:
      data.setFloat32(offset, readNumber(variable, memory), true);
      return 4;
    case TypeTag.DOUBLE:
      data.setFloat64(offset, readNumber(variable, memory), true);
      return 8;
    case TypeTag.STRING: {
      const value = readString(variable, memory);
      if (stringsHaveLengthPrefixed) {
        data.setInt16(offset, value.length);
        copyString(data, offset + 2, value);
        return 2 + value.length;
      }
      copyString(data, offset, value);
      return value.length;
    }
    case TypeTag.FIXED_STRING:
      return copyStringWithPadding(data, offset, readString(variable, memory), type.maxLength);
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

function readNumber(variable: Variable, memory: Memory): number {
  const value = memory.read(variable);
  if (!value) {
    return 0;
  }
  if (!isNumeric(value)) {
    throw new Error('non-numeric value for numeric variable');
  }
  return value.number;
}

function readString(variable: Variable, memory: Memory): string {
  const value = memory.read(variable);
  if (!value) {
    return "";
  }
  if (!isString(value)) {
    throw new Error('non-string value for string variable');
  }
  return value.string;
}

export class BloadStatement extends Statement {
  private token: Token;
  private pathExpr: ExprContext;
  private offsetExpr?: ExprContext;

  constructor({token, params}: BuiltinStatementArgs) {
    super();
    this.token = token;
    this.pathExpr = params[0].expr!;
    this.offsetExpr = params[1].expr;
  }

  override execute(context: ExecutionContext) {
    const path = evaluateStringExpression(this.pathExpr, context.memory);
    const offset = (this.offsetExpr && (evaluateIntegerExpression(this.offsetExpr, context.memory) & 0xffff)) ?? 0;
    if (offset !== 0) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
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
      const segment = context.memory.getSegment();
      if ((segment & 0xffff) === 0xa000  || (storedSegment === 0xa000 && !this.offsetExpr)) {
        // Assume we are trying to BLOAD a full width bitmap into video ram.
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
        context.devices.screen.putBitmap({
          x1: 0,
          y1: 0,
          step: false,
          operation: BlitOperation.PSET,
          buffer: bitmap.buffer,
        });
        return;
      }
      const {variable} = context.memory.readPointer(segment);
      writeBytesAtPointer(context.memory, variable, newData);
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
  private pathExpr: ExprContext;
  private offsetExpr: ExprContext;
  private lengthExpr: ExprContext;

  constructor({token, params}: BuiltinStatementArgs) {
    super();
    this.token = token;
    this.pathExpr = params[0].expr!;
    this.offsetExpr = params[1].expr!;
    this.lengthExpr = params[2].expr!;
  }

  override execute(context: ExecutionContext) {
    const path = evaluateStringExpression(this.pathExpr, context.memory);
    const length = evaluateIntegerExpression(this.lengthExpr, context.memory) & 0xffff;
    const offset = evaluateIntegerExpression(this.offsetExpr, context.memory) & 0xffff;
    try {
      const [_, bytes] = readBytesAtPointer(context.memory);
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
  private addressExpr: ExprContext;
  private result: Variable;

  constructor({token, params, result}: BuiltinStatementArgs) {
    super();
    this.token = token;
    this.addressExpr = params[0].expr!;
    this.result = result!;
  }

  override execute(context: ExecutionContext) {
    const address = evaluateIntegerExpression(this.addressExpr, context.memory, { tag: TypeTag.LONG });
    if (address < -65536 || address > 65535) {
      throw RuntimeError.fromToken(this.token, OVERFLOW);
    }
    try {
      const [_, data] = readBytesAtPointer(context.memory);
      context.memory.write(this.result, integer(data[address] ?? 0));
    } catch (e: unknown) {
      const segment = context.memory.getSegment();
      let data = 0;
      if ((segment & 0xffff) === 0xa000) {
        const mode = context.devices.screen.getMode();
        if (mode.mode !== 13) {
          throw new Error('Only support PEEKing video memory in mode 13');
        }
        const y = ~~(address / 320);
        const x = ~~(address % 320);
        data = context.devices.screen.getPixel(x, y, /*screen=*/ true);
      } else {
        const offset = address;
        const linearAddress = (segment << 4) | offset;
        switch (linearAddress) {
          case 0x410:
            data = 38;  // donkey.bas checks the BIOS equipment byte.
            break;
          case 0x46c:
            data = context.devices.timer.rawTicks() & 0xff;
            break;
        }
      }
      context.memory.write(this.result, integer(data));
    }
  }
}

export class PokeStatement extends Statement {
  private token: Token;
  private addressExpr: ExprContext;
  private valueExpr: ExprContext;

  constructor({token, params, result}: BuiltinStatementArgs) {
    super();
    this.token = token;
    this.addressExpr = params[0].expr!;
    this.valueExpr = params[1].expr!;
  }

  override execute(context: ExecutionContext) {
    const address = evaluateIntegerExpression(this.addressExpr, context.memory, { tag: TypeTag.LONG });
    if (address < -65536 || address > 65535) {
      throw RuntimeError.fromToken(this.token, OVERFLOW);
    }
    const byte = evaluateIntegerExpression(this.valueExpr, context.memory) & 255;
    const segment = context.memory.getSegment();
    if ((segment & 0xffff) === 0xa000) {
      const mode = context.devices.screen.getMode();
      if (mode.mode !== 13) {
        throw new Error('Only support POKEing video memory in mode 13');
      }
      const y = ~~(address / 320);
      const x = ~~(address % 320);
      context.devices.screen.setPixel(x, y, byte, /*step=*/ false, /*screen=*/ true);
      return;
    }
    try {
      const [variable, data] = readBytesAtPointer(context.memory);
      if (address < data.length) {
        data[address] = byte;
        writeBytesAtPointer(context.memory, variable, data);
      }
    } catch (e: unknown) {
    }
  }
}

function readBytesAtPointer(memory: Memory): [Variable, Uint8Array] {
  const segment = memory.getSegment();
  const {variable} = memory.readPointer(segment);
  const bytes = variable.array ?
    readBytesFromArray(variable, memory) :
    readVariableToBytes(variable, memory);
  return [variable, new Uint8Array(bytes)];
}

function writeBytesAtPointer(memory: Memory, variable: Variable, data: Uint8Array) {
  if (variable.array) {
    writeBytesToArray(variable, data.buffer, memory);
  } else {
    writeBytesToVariable(variable, data.buffer, memory);
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

export function wrap16Bit(x: number) {
  return x & 0x8000 ? (x & 0x7fff) - 0x8000 : x & 0x7fff;
}