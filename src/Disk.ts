import { asciiToString, charToAscii } from "./AsciiChart.ts";
import { IOError } from "./Errors.ts";
import { FileAccessor, Handle, isSequentialWriteMode, Opener, OpenMode } from "./Files.ts";
import { BasePrinter } from "./Printer.ts";
import * as values from "./Values.ts";

export interface Disk extends Opener {
  getCurrentDirectory(): string;
  changeDirectory(path: string): void;
  makeDirectory(path: string): void;
  removeDirectory(path: string): void;
  listFiles(pattern: string): DiskEntry[];
  removeFiles(pattern: string): void;
  rename(oldPath: string, newPath: string): void;
}

export interface DiskFile {
  isDirectory: false;
  name: string;
  bytes: number[];
}

export interface DiskDirectory {
  isDirectory: true;
  name: string;
  entries: Map<string, DiskEntry>;
}

export type DiskEntry =
  | DiskFile
  | DiskDirectory;

export class MemoryDrive implements Disk {
  drive: string;
  rootDirectory = directory('');
  currentDirectory: Path;
  handles: Map<string, Handle> = new Map();
  modified: boolean = false;

  constructor(drive: string = "C") {
    this.drive = drive;
    this.currentDirectory = {drive, names: ['']};
  }

  getCurrentDirectory(): string {
    const path = this.currentDirectory.names.join('\\');
    return `${this.currentDirectory.drive}:${path || '\\'}`
  }

  changeDirectory(path: string) {
    const target = parsePath(path, this.currentDirectory);
    this.lookupOrThrow(target);
    this.currentDirectory = target;
  }

  makeDirectory(path: string): DiskEntry {
    const [parent, name] = this.getParentDirectoryAndFileName(path);
    const existingEntry = parent.entries.get(name);
    if (existingEntry) {
      if (existingEntry.isDirectory) {
        throw new IOError(values.PATH_FILE_ACCESS_ERROR);
      }
      throw new IOError(values.PATH_NOT_FOUND);
    }
    const entry = directory(name);
    parent.entries.set(name, entry);
    this.flush(parent);
    return entry;
  }

  removeDirectory(path: string) {
    const [parent, name] = this.getParentDirectoryAndFileName(path);
    const entry = parent.entries.get(name);
    if (!entry || !entry.isDirectory) {
      throw new IOError(values.PATH_NOT_FOUND);
    }
    if (entry.entries.size > 0) {
      throw new IOError(values.PATH_FILE_ACCESS_ERROR);
    }
    parent.entries.delete(name);
    this.flush(parent);
  }

  listFiles(pattern: string): DiskEntry[] {
    if (pattern === '') {
      const path = this.getCurrentDirectory();
      const pathBackslash = path.endsWith('\\') ? path : `${path}\\`;
      pattern = pathBackslash;
    }
    const [parent, name] = this.getParentDirectoryAndFileName(pattern, /* allowEmptyName= */ true);
    if (name === '') {
      return [directory('.'), directory('..'), ...parent.entries.values()];
    }
    return Array.from(parent.entries.entries())
      .filter((entry: [string, DiskEntry]) => matchPattern(entry[0], name))
      .map((entry: [string, DiskEntry]) => entry[1]);
  }

  removeFiles(pattern: string) {
    if (pattern === '') {
      const path = this.getCurrentDirectory();
      const pathBackslash = path.endsWith('\\') ? path : `${path}\\`;
      pattern = pathBackslash;
    }
    const [parent, name] = this.getParentDirectoryAndFileName(pattern, /* allowEmptyName= */ true);
    const matches = Array.from(parent.entries.entries())
      .filter((entry: [string, DiskEntry]) =>
        !entry[1].isDirectory && matchPattern(entry[0], name));
    if (matches.length === 0) {
      throw new IOError(values.FILE_NOT_FOUND);
    }
    for (const [name, entry] of matches) {
      parent.entries.delete(name);
    }
    this.flush(parent);
  }

  rename(oldPath: string, newPath: string) {
    const [sourceParent, sourceName] = this.getParentDirectoryAndFileName(oldPath);
    const entry = sourceParent.entries.get(sourceName);
    if (!entry) {
      throw new IOError(values.PATH_NOT_FOUND);
    }

    const [targetParent, targetName] = this.getParentDirectoryAndFileName(newPath);
    if (!targetParent.isDirectory || !targetName) {
      throw new IOError(values.PATH_NOT_FOUND);
    }
    if (targetParent.entries.get(targetName)) {
      throw new IOError(values.FILE_ALREADY_EXISTS);
    }
    sourceParent.entries.delete(sourceName);
    targetParent.entries.set(targetName, entry);
    entry.name = targetName;
    this.flush(sourceParent);
    this.flush(targetParent);
  }

  open(path: string, mode: OpenMode, recordLength?: number): Handle {
    const target = parsePath(path, this.currentDirectory);
    const [parentDir, name] = splitPath(target);
    const parent = this.lookupOrThrow(parentDir);
    if (!parent.isDirectory || !name) {
      throw new IOError(values.PATH_NOT_FOUND);
    }
    const canonPath = target.names.join('\\');
    if (this.handles.has(canonPath)) {
      throw new IOError(values.FILE_ALREADY_OPEN);
    }
    let file = parent.entries.get(name);
    if (!file || mode === OpenMode.OUTPUT) {
      if (mode === OpenMode.INPUT) {
        throw new IOError(values.FILE_NOT_FOUND);
      }
      file = {isDirectory: false, name, bytes: []};
      parent.entries.set(name, file);
      this.flush(file);
    }
    if (file.isDirectory) {
      throw new IOError(values.PATH_FILE_ACCESS_ERROR);
    }
    const fsHandle: MemoryDriveFileHandle = {
      canonPath,
      dirty: () => this.flush(file),
    };
    const handle = {
      owner: this,
      data: fsHandle,
      accessor: new MemoryDriveFileAccessor(fsHandle, file, mode, recordLength)
    };
    this.handles.set(canonPath, handle);
    return handle;
  }

  close(handle: Handle) {
    const fsHandle = handle.data as MemoryDriveFileHandle;
    this.handles.delete(fsHandle.canonPath);
  }

  loadFromJson(json: string) {
    const reviver = (key: string, value: unknown) => {
      if (key === 'entries') {
        return new Map(value as Array<[string, DiskEntry]>);
      }
      return value;
    }
    this.rootDirectory = JSON.parse(json, reviver);
  }

  saveToJson(): string {
    const replacer = (key: string, value: unknown) => {
      if (key === 'entries') {
        return Array.from((value as Map<string, DiskEntry>).entries());
      }
      return value;
    };
    return JSON.stringify(this.rootDirectory, replacer);
  }

  private flush(entry: DiskEntry) {
    this.modified = true;
  }

  private getParentDirectoryAndFileName(path: string, allowEmptyName = false): [DiskDirectory, string] {
    const target = parsePath(path, this.currentDirectory);
    const [parentDir, name] = splitPath(target);
    const parent = this.lookupOrThrow(parentDir);
    if (!parent.isDirectory || (!allowEmptyName && !name)) {
      throw new IOError(values.PATH_NOT_FOUND);
    }
    return [parent, name];
  }

  private lookupOrThrow(path: Path): DiskEntry {
    if (path.names.length === 0 || path.names[0] !== '') {
      throw new IOError(values.PATH_NOT_FOUND);
    }
    let entry: DiskEntry = this.rootDirectory;
    for (const name of path.names.slice(1)) {
      if (!entry.isDirectory) {
        throw new IOError(values.PATH_NOT_FOUND);
      }
      const next = entry.entries.get(name);
      if (!next) {
        throw new IOError(values.PATH_NOT_FOUND);
      }
      entry = next;
    }
    return entry;
  }
}

interface MemoryDriveFileHandle {
  canonPath: string;
  dirty: () => void;
}

class MemoryDriveFileAccessor extends BasePrinter implements FileAccessor {
  handle: MemoryDriveFileHandle;
  file: DiskFile;
  mode: OpenMode;
  recordLength: number;
  position: number;
  lastAccessPosition: number;

  constructor(handle: MemoryDriveFileHandle, file: DiskFile, mode: OpenMode, recordLength?: number) {
    super(65535);  // No width set by default
    this.handle = handle;
    this.file = file;
    this.mode = mode;
    this.recordLength = recordLength ?? (mode === OpenMode.RANDOM ? 128 : 1);
    this.lastAccessPosition = 0;
    this.position = this.mode === OpenMode.APPEND ? this.file.bytes.length : 0;
  }

  openMode(): OpenMode {
    return this.mode;
  }

  seek(pos: number) {
    if (pos <= 0) {
      throw new IOError(values.BAD_RECORD_NUMBER);
    }
    this.position = pos - 1;
  }

  getBytes(numBytes: number): number[] {
    return [];
  }

  putBytes(bytes: number[]) {
  }

  putChar(ch: string) {
    if (this.mode === OpenMode.RANDOM) {
      return;
    }
    if (!isSequentialWriteMode(this.openMode())) {
      throw new IOError(values.BAD_FILE_MODE);
    }
    const value = charToAscii.get(ch);
    if (value === undefined) {
      throw new Error("unmapped character");
    }
    if (this.position > this.file.bytes.length) {
      const padding = this.position - this.file.bytes.length;
      this.file.bytes.push(...zeros(padding));
    }
    this.file.bytes.splice(this.position, 1, value);
    this.lastAccessPosition = this.position;
    this.position++;
    this.handle.dirty();
  }

  readChars(numBytes: number): string {
    if (this.mode === OpenMode.OUTPUT || this.mode === OpenMode.APPEND) {
      throw new IOError(values.BAD_FILE_MODE);
    }
    if (this.mode === OpenMode.RANDOM) {
      return asciiToString(zeros(numBytes));
    }
    if (this.position + numBytes > this.file.bytes.length) {
      throw new IOError(values.INPUT_PAST_END_OF_FILE);
    }
    const start = this.position;
    this.lastAccessPosition = this.position + numBytes - 1;
    this.position += numBytes;
    return asciiToString(this.file.bytes.slice(start, this.position));
  }

  readLine(): string {
    if (this.mode === OpenMode.RANDOM) {
      throw new IOError(values.FIELD_OVERFLOW);
    }
    if (this.mode !== OpenMode.INPUT) {
      throw new IOError(values.BAD_FILE_MODE);
    }
    if (this.eof()) {
      throw new IOError(values.INPUT_PAST_END_OF_FILE);
    }
    const start = this.position;
    let end = this.position;
    while (this.position < this.file.bytes.length) {
      if (this.file.bytes[this.position] === 13) {
        if (this.file.bytes[this.position + 1] === 10) {
          this.position += 2;
        } else {
          this.position++;
        }
        break;
      }
      // Accept unix newlines for convenience.
      if (this.file.bytes[this.position] === 10) {
        this.position++;
        break;
      }
      end++;
      this.position++;
    }
    this.lastAccessPosition = this.position - 1;
    return asciiToString(this.file.bytes.slice(start, end));
  }

  length(): number {
    return this.file.bytes.length;
  }

  eof(): boolean {
    return this.position >= this.file.bytes.length;
  }

  getSeek(): number {
    if (this.mode === OpenMode.RANDOM) {
      return Math.floor(this.position / this.recordLength) + 1;
    }
    return this.position + 1;
  }

  getLoc(): number {
    if (this.mode === OpenMode.BINARY) {
      return this.lastAccessPosition + 1;
    }
    return Math.floor(this.lastAccessPosition / this.recordLength) + 1;
  }
}

interface Path {
  drive?: string;
  names: string[];
}

function parsePath(path: string, base: Path): Path {
  path = path.toUpperCase();
  const drive = base.drive;
  if (/^[A-Za-z]:/.test(path)) {
    if (drive != path[0]) {
      throw new IOError(values.PATH_NOT_FOUND);
    }
    path = path.slice(2);
  }
  if (path.length == 0) {
    return base;
  }
  if (path === '\\') {
    return {drive, names: ['']};
  }
  const pathParts = path.split('\\');
  const absolute = pathParts[0] === '';
  const relNames: string[] = absolute ? pathParts : [...base.names, ...pathParts];
  const names: string[] = [];
  for (const name of relNames) {
    if (name === '..') {
      names.pop();
    } else if (name === '.') {
      // Skip current directory.
    } else {
      names.push(name);
    }
  }
  return {drive, names};
}

function splitPath(path: Path): [Path, string] {
  if (path.names.length === 0) {
    throw new IOError(values.PATH_NOT_FOUND);
  }
  if (path.names.length === 1) {
    return [path, path.names[0]];
  }
  const parentDir = {drive: path.drive, names: path.names.slice(0, -1)};
  return [parentDir, path.names.at(-1)!]
}

function matchPattern(name: string, pattern: string): boolean {
  if (pattern === name) {
    return true;
  }
  const regexp = (p: string) => new RegExp('^' + p.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
  const [baseName, extension] = name.split('.');
  const [basePattern, extensionPattern] = pattern.split('.');
  return regexp(basePattern ?? '').test(baseName ?? '') &&
    regexp(extensionPattern ?? '').test(extension ?? '');
}

function directory(name: string): DiskDirectory {
  return {isDirectory: true, name, entries: new Map()};
}

function zeros(count: number): number[] {
  return Array(count).fill(0);
}