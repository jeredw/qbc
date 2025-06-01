import { Token } from "antlr4ng";
import { ExprContext } from "../../build/QBasicParser.ts";
import { evaluateIntegerExpression, evaluateStringExpression } from "../Expressions.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";
import { integer, isNumeric, isString, long, string, StringValue, Value } from "../Values.ts";
import { IOError, RuntimeError, BAD_FILE_MODE, BAD_FILE_NAME_OR_NUMBER, BAD_RECORD_LENGTH, FIELD_OVERFLOW, FIELD_STATEMENT_ACTIVE, ILLEGAL_FUNCTION_CALL, TYPE_MISMATCH, VARIABLE_REQUIRED } from "../Errors.ts";
import { FileAccessor, Handle, isSequentialReadMode, isSequentialWriteMode, OpenMode, tryIo } from "../Files.ts";
import { BuiltinParam, BuiltinStatementArgs } from "../Builtins.ts";
import { DiskEntry } from "../Disk.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { getScalarVariableSizeInBytes, Variable } from "../Variables.ts";
import { asciiToString, stringToAscii } from "../AsciiChart.ts";
import { readVariableToBytes, writeBytesToVariable } from "./Bits.ts";

export interface OpenArgs {
  token: Token;
  name: ExprContext;
  fileNumber: ExprContext;
  mode: OpenMode;
  recordLength?: ExprContext;
}

export class OpenStatement extends Statement {
  constructor(private args: OpenArgs) {
    super();
  }

  override execute(context: ExecutionContext) {
    const name = evaluateStringExpression(this.args.name, context.memory);
    const fileNumber = evaluateIntegerExpression(this.args.fileNumber, context.memory);
    if (name.length < 1 || name.length > 255 || fileNumber < 0 || fileNumber > 255) {
      throw RuntimeError.fromToken(this.args.token, BAD_FILE_NAME_OR_NUMBER);
    }
    const recordLength = this.args.recordLength &&
      evaluateIntegerExpression(this.args.recordLength, context.memory);
    if (recordLength && recordLength <= 0) {
      throw RuntimeError.fromToken(this.args.token, ILLEGAL_FUNCTION_CALL);
    }
    tryIo(this.args.token, () => {
      const handle = context.devices.disk.open(name, this.args.mode, recordLength);
      context.files.handles.set(fileNumber, handle);
    });
  }
}

export class CloseStatement extends Statement {
  constructor(private fileNumber: ExprContext) {
    super();
  }

  override execute(context: ExecutionContext) {
    const fileNumber = evaluateIntegerExpression(this.fileNumber, context.memory);
    const handle = context.files.handles.get(fileNumber);
    if (handle) {
      handle.owner.close(handle);
      for (const value of handle.fields) {
        value.field = undefined;
        value.string = "";
      }
      handle.fields = [];
    }
    context.files.handles.delete(fileNumber);
  }
}

abstract class FileSystemStatement extends Statement {
  token: Token;
  params: BuiltinParam[];

  constructor({token, params}: BuiltinStatementArgs) {
    super();
    this.token = token;
    this.params = params;
    if (this.params.length != 1) {
      throw new Error("expecting one argument");
    }
  }

  override execute(context: ExecutionContext) {
    // expr is optional for the "files" statement.
    const arg = this.params[0].expr ?
      evaluateStringExpression(this.params[0].expr, context.memory) :
      '';
    tryIo(this.token, () => this.access(arg, context));
  }

  abstract access(path: string, context: ExecutionContext): void;
}

export class ChdirStatement extends FileSystemStatement {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override access(path: string, context: ExecutionContext) {
    context.devices.disk.changeDirectory(path);
  }
}

export class MkdirStatement extends FileSystemStatement {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override access(path: string, context: ExecutionContext) {
    context.devices.disk.makeDirectory(path);
  }
}

export class RmdirStatement extends FileSystemStatement {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override access(path: string, context: ExecutionContext) {
    context.devices.disk.removeDirectory(path);
  }
}

export class FilesStatement extends FileSystemStatement {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override access(pattern: string, context: ExecutionContext) {
    const entries = context.devices.disk.listFiles(pattern);
    const {screen} = context.devices;
    screen.print(context.devices.disk.getCurrentDirectory(), true);
    const formattedEntries = entries.map(formatEntry);
    for (let i = 0; i < formattedEntries.length; i++) {
      screen.print(formattedEntries[i], false);
      if (i != formattedEntries.length - 1) {
        if (i % 4 === 3) {
          screen.print('', true);
        } else {
          screen.print(' ', false);
        }
      }
    }
    screen.print('', true);
    screen.print(' 262144000 Bytes free', true);
  }
}

function formatEntry(entry: DiskEntry): string {
  if (entry.name === '.') {
    return '        .   <DIR>';
  }
  if (entry.name === '..') {
    return '        ..  <DIR>';
  }
  const [name, extension] = entry.name.split('.');
  const extensionField = extension ? '.' + extension.padEnd(3) : '    ';
  const directoryField = entry.isDirectory ? '<DIR>' : '     ';
  return `${name.padEnd(8)}${extensionField}${directoryField}`
}

export class KillStatement extends FileSystemStatement {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override access(pattern: string, context: ExecutionContext) {
    context.devices.disk.removeFiles(pattern);
  }
}

export class NameStatement extends Statement {
  constructor(
    private token: Token,
    private oldPathExpr: ExprContext,
    private newPathExpr: ExprContext
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const oldPath = evaluateStringExpression(this.oldPathExpr, context.memory);
    const newPath = evaluateStringExpression(this.newPathExpr, context.memory);
    tryIo(this.token, () => context.devices.disk.rename(oldPath, newPath));
  }
}

export class EofFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    let result = 0;
    tryIo(this.token, () => {
      const accessor = getFileAccessor({fileNumber: input.number, context});
      result = accessor.eof() ? -1 : 0;
    });
    return integer(result);
  }
}

export class LocFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    let result = 0;
    tryIo(this.token, () => {
      const accessor = getFileAccessor({fileNumber: input.number, context});
      result = accessor.getLoc();
    });
    return long(result);
  }
}

export class LofFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    let result = 0;
    tryIo(this.token, () => {
      const accessor = getFileAccessor({fileNumber: input.number, context});
      result = accessor.length();
    });
    return long(result);
  }
}

export class SeekFunction extends Statement {
  constructor(
    private token: Token,
    private fileNumber: ExprContext,
    private result: Variable
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    let result = 0;
    tryIo(this.token, () => {
      const accessor = getFileAccessor({expr: this.fileNumber, context});
      result = accessor.getSeek();
    });
    context.memory.write(this.result, long(result));
  }
}

export class SeekStatement extends Statement {
  constructor(
    private token: Token,
    private fileNumber: ExprContext,
    private offset: ExprContext
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    tryIo(this.token, () => {
      const accessor = getFileAccessor({expr: this.fileNumber, context});
      const offset = evaluateIntegerExpression(this.offset, context.memory);
      accessor.seek(offset);
    });
  }
}

export class FreefileFunction extends Statement {
  result: Variable;

  constructor({result}: BuiltinStatementArgs) {
    super();
    if (!result) {
      throw new Error('missing result variable');
    }
    this.result = result;
  }

  override execute(context: ExecutionContext) {
    context.memory.write(this.result, integer(context.files.getFreeHandle()));
  }
}

export class FileattrFunction extends Statement {
  token: Token;
  fileNumber: ExprContext;
  attribute: ExprContext;
  result: Variable;

  constructor({token, result, params}: BuiltinStatementArgs) {
    super();
    if (!params[0] || !params[0].expr) {
      throw new Error('missing file number');
    }
    this.fileNumber = params[0].expr;
    if (!params[1] || !params[1].expr) {
      throw new Error('missing attribute');
    }
    this.attribute = params[1].expr;
    this.token = token;
    if (!result) {
      throw new Error('missing result variable');
    }
    this.result = result;
  }

  override execute(context: ExecutionContext) {
    const fileNumber = evaluateIntegerExpression(this.fileNumber, context.memory);
    const handle = context.files.handles.get(fileNumber);
    if (!handle) {
      throw RuntimeError.fromToken(this.token, BAD_FILE_NAME_OR_NUMBER);
    }
    const attribute = evaluateIntegerExpression(this.attribute, context.memory);
    if (!(attribute === 1 || attribute === 2)) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    const attributeValue = attribute === 1 ? encodeOpenMode(handle.accessor.openMode())
      : fileNumber;
    context.memory.write(this.result, integer(attributeValue));
  }
}

function encodeOpenMode(openMode: OpenMode): number {
  switch (openMode) {
    case OpenMode.INPUT:
      return 1;
    case OpenMode.OUTPUT:
      return 2;
    case OpenMode.RANDOM:
      return 4;
    case OpenMode.APPEND:
      return 8;
    case OpenMode.BINARY:
      return 32;
  }
}

interface GetFileAccessorArgs {
  expr?: ExprContext;
  fileNumber?: number;
  context: ExecutionContext;
}

function getFileHandle({expr, fileNumber, context}: GetFileAccessorArgs): Handle {
  const file = fileNumber ?? evaluateIntegerExpression(expr!, context.memory);
  if (file < 0 || file > 255) {
    throw new IOError(BAD_FILE_NAME_OR_NUMBER);
  }
  const handle = context.files.handles.get(file);
  if (!handle) {
    throw new IOError(BAD_FILE_NAME_OR_NUMBER);
  }
  return handle;
}

function getFileAccessor(args: GetFileAccessorArgs): FileAccessor {
  return getFileHandle(args).accessor;
}

export function getSequentialWriteAccessor(args: GetFileAccessorArgs): FileAccessor {
  const accessor = getFileAccessor(args);
  if (!isSequentialWriteMode(accessor.openMode())) {
    throw new IOError(BAD_FILE_MODE);
  }
  return accessor;
}

export function getSequentialReadAccessor(args: GetFileAccessorArgs): FileAccessor {
  const accessor = getFileAccessor(args);
  if (!isSequentialReadMode(accessor.openMode())) {
    throw new IOError(BAD_FILE_MODE);
  }
  return accessor;
}

export interface FieldDefinition {
  widthExpr: ExprContext;
  variable: Variable;
}

export class FieldStatement extends Statement {
  constructor(
    private token: Token,
    private fileNumber: ExprContext,
    private fields: FieldDefinition[]
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    tryIo(this.token, () => {
      const handle = getFileHandle({expr: this.fileNumber, context});
      const accessor = handle.accessor;
      const buffer = accessor.getRecordBuffer();
      let offset = 0;
      const fields = handle.fields;
      for (const {variable, widthExpr} of this.fields) {
        const width = evaluateIntegerExpression(widthExpr, context.memory);
        if (width < 0) {
          throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
        }
        if (offset + width > buffer.length) {
          throw RuntimeError.fromToken(this.token, FIELD_OVERFLOW);
        }
        const value = context.memory.read(variable) ?? string("");
        if (!isString(value)) {
          throw RuntimeError.fromToken(this.token, TYPE_MISMATCH);
        }
        value.field = {buffer, offset, width, fields};
        handle.fields.push(value);
        context.memory.write(variable, value);
        offset += width;
      }
      copyRecordBufferToStringFields(handle.fields);
    });
  }
}

export function updateRecordBuffer(value: StringValue) {
  const field = value.field;
  if (!field) {
    return;
  }
  const {buffer, offset, width} = field;
  const ascii = stringToAscii(value.string.slice(0, width));
  buffer.splice(offset, ascii.length, ...ascii);
  copyRecordBufferToStringFields(field.fields);
}

function copyRecordBufferToStringFields(values: StringValue[]) {
  for (const value of values) {
    const field = value.field;
    if (field) {
      const {buffer, offset, width} = field;
      const fieldString = asciiToString(buffer.slice(offset, offset + width));
      value.string = fieldString;
    }
  }
}

abstract class GetPutStatement extends Statement {
  constructor(
    protected token: Token,
    protected fileNumber: ExprContext,
    protected recordNumber?: ExprContext,
    protected variable?: Variable,
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    tryIo(this.token, () => {
      const handle = getFileHandle({expr: this.fileNumber, context});
      const accessor = handle.accessor;
      if (accessor.openMode() === OpenMode.RANDOM) {
        this.randomAccess(handle, accessor, context);
        return;
      }
      if (accessor.openMode() === OpenMode.BINARY) {
        if (!this.variable) {
          throw RuntimeError.fromToken(this.token, VARIABLE_REQUIRED);
        }
        this.binaryAccess(accessor, context);
        return;
      }
      throw new IOError(BAD_FILE_MODE);
    });
  }

  protected getRecordNumber(context: ExecutionContext): number | undefined {
    return this.recordNumber &&
      evaluateIntegerExpression(this.recordNumber, context.memory);
  }

  abstract randomAccess(handle: Handle, accessor: FileAccessor, context: ExecutionContext): void;
  abstract binaryAccess(accessor: FileAccessor, context: ExecutionContext): void;
}

export class GetIoStatement extends GetPutStatement {
  constructor(
    token: Token,
    fileNumber: ExprContext,
    recordNumber?: ExprContext,
    variable?: Variable,
  ) {
    super(token, fileNumber, recordNumber, variable);
  }

  override randomAccess(handle: Handle, accessor: FileAccessor, context: ExecutionContext) {
    const recordNumber = this.getRecordNumber(context);
    accessor.getRecord(recordNumber);
    if (this.variable) {
      if (handle.fields.length > 0) {
        throw RuntimeError.fromToken(this.token, FIELD_STATEMENT_ACTIVE);
      }
      const record = accessor.getRecordBuffer();
      const size = getScalarVariableSizeInBytes(this.variable!, context.memory, /* stringsHaveLengthPrefixed */ true);
      if (size > record.length) {
        throw RuntimeError.fromToken(this.token, BAD_RECORD_LENGTH);
      }
      writeBytesToVariable(this.variable, new Uint8Array(record).buffer, context.memory);
      return;
    }
    copyRecordBufferToStringFields(handle.fields);
  }

  override binaryAccess(accessor: FileAccessor, context: ExecutionContext) {
    const position = this.getRecordNumber(context);
    const size = getScalarVariableSizeInBytes(this.variable!, context.memory);
    const bytes = accessor.getBytes(size, position);
    writeBytesToVariable(this.variable!, new Uint8Array(bytes).buffer, context.memory);
  }
}

export class PutIoStatement extends GetPutStatement {
  constructor(
    token: Token,
    fileNumber: ExprContext,
    recordNumber?: ExprContext,
    variable?: Variable,
  ) {
    super(token, fileNumber, recordNumber, variable);
  }

  randomAccess(handle: Handle, accessor: FileAccessor, context: ExecutionContext) {
    const recordNumber = this.getRecordNumber(context);
    if (this.variable) {
      if (handle.fields.length > 0) {
        throw RuntimeError.fromToken(this.token, FIELD_STATEMENT_ACTIVE);
      }
      const buffer = readVariableToBytes(this.variable, context.memory, /* stringsHaveLengthPrefixed */ true);
      const bytes = new Uint8Array(buffer);
      const record = accessor.getRecordBuffer();
      if (bytes.length > record.length) {
        throw RuntimeError.fromToken(this.token, BAD_RECORD_LENGTH);
      }
      for (let i = 0; i < record.length; i++) {
        record[i] = i < bytes.length ? bytes[i] : 0;
      }
    }
    accessor.putRecord(recordNumber);
  }

  binaryAccess(accessor: FileAccessor, context: ExecutionContext) {
    const position = this.getRecordNumber(context);
    const bytes = new Uint8Array(readVariableToBytes(this.variable!, context.memory));
    accessor.putBytes(Array.from(bytes), position);
  }
}

export class WidthFileStatement extends Statement {
  constructor(
    private token: Token,
    private fileNumber: ExprContext,
    private width: ExprContext
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const columns = evaluateIntegerExpression(this.width, context.memory);
    if (columns < 1 || columns > 255) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    tryIo(this.token, () => {
      const accessor = getFileAccessor({expr: this.fileNumber, context});
      accessor.setWidth(columns);
    });
  }
}