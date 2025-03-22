import { Token } from "antlr4ng";
import { ExprContext } from "../../build/QBasicParser.ts";
import { evaluateIntegerExpression, evaluateStringExpression } from "../Expressions.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";
import { BAD_FILE_MODE, BAD_FILE_NAME_OR_NUMBER, error, integer, isNumeric, long, Value } from "../Values.ts";
import { IOError, RuntimeError } from "../Errors.ts";
import { FileAccessor, isSequentialReadMode, isSequentialWriteMode, OpenMode, tryIo } from "../Files.ts";
import { BuiltinParam, BuiltinStatementArgs } from "../Builtins.ts";
import { DiskEntry } from "../Disk.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { Variable } from "../Variables.ts";

export interface OpenArgs {
  token: Token;
  name: ExprContext;
  fileNumber: ExprContext;
  mode: OpenMode;
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
    tryIo(this.args.token, () => {
      const handle = context.devices.disk.open(name, this.args.mode);
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
    const screen = context.devices.textScreen;
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

interface GetFileAccessorArgs {
  expr?: ExprContext;
  fileNumber?: number;
  context: ExecutionContext;
}

function getFileAccessor({expr, fileNumber, context}: GetFileAccessorArgs): FileAccessor {
  const file = fileNumber ?? evaluateIntegerExpression(expr!, context.memory);
  if (file < 0 || file > 255) {
    throw new IOError(BAD_FILE_NAME_OR_NUMBER);
  }
  const handle = context.files.handles.get(file);
  if (!handle) {
    throw new IOError(BAD_FILE_NAME_OR_NUMBER);
  }
  return handle.accessor;
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