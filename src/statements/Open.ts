import { Token } from "antlr4ng";
import { ExprContext } from "../../build/QBasicParser.ts";
import { evaluateIntegerExpression, evaluateStringExpression } from "../Expressions.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";
import { BAD_FILE_MODE, BAD_FILE_NAME_OR_NUMBER, error } from "../Values.ts";
import { IOError, RuntimeError } from "../Errors.ts";
import { FileAccessor, isSequentialReadMode, isSequentialWriteMode, OpenMode, tryIo } from "../Files.ts";

export interface OpenArgs {
  token: Token;
  name: ExprContext;
  fileNumber: ExprContext;
  mode: OpenMode;
}

export class OpenStatement extends Statement {
  args: OpenArgs;

  constructor(args: OpenArgs) {
    super();
    this.args = args;
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
  fileNumber: ExprContext;

  constructor(fileNumber: ExprContext) {
    super();
    this.fileNumber = fileNumber;
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

interface GetFileAccessorArgs {
  fileNumber: ExprContext;
  context: ExecutionContext;
}

function getFileAccessor({fileNumber, context}: GetFileAccessorArgs): FileAccessor {
  const file = evaluateIntegerExpression(fileNumber, context.memory);
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