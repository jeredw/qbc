import { Token } from "antlr4ng";
import { Printer } from "./Printer.ts";
import { IOError, RuntimeError } from "./Errors.ts";

export enum OpenMode {
  OUTPUT,
  INPUT,
  APPEND,
  RANDOM,
  BINARY
}

export interface Opener {
  open(path: string, mode: OpenMode, recordLength?: number): Handle;
  close(handle: Handle): void;
}

export interface FileAccessor extends Printer {
  openMode(): OpenMode;

  seek(pos: number): void;
  getBytes(numBytes: number): number[];
  putBytes(bytes: number[]): void;
  readChars(numBytes: number): string;
  readLine(): string;

  length(): number;
  eof(): boolean;
  getSeek(): number;
  getLoc(): number;
}

export interface Handle {
  owner: Opener;
  data: unknown;
  accessor: FileAccessor;
}

export class Files {
  handles: Map<number, Handle> = new Map();

  getFreeHandle(): number {
    const maxHandle = Math.max(...this.handles.keys());
    return isFinite(maxHandle) ? maxHandle + 1 : 1;
  }
}

export function isSequentialWriteMode(mode: OpenMode): boolean {
  return mode === OpenMode.OUTPUT || mode === OpenMode.RANDOM || mode === OpenMode.APPEND;
}

export function isSequentialReadMode(mode: OpenMode): boolean {
  return mode === OpenMode.INPUT || mode === OpenMode.RANDOM;
}

export function tryIo(token: Token, fn: () => void) {
  try {
    fn();
  } catch (e: unknown) {
    if (e instanceof IOError) {
      throw RuntimeError.fromToken(token, e.error);
    }
    throw e;
  }
}