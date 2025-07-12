import { asciiToString, charToAscii } from "./AsciiChart.ts";
import { BAD_FILE_MODE, BAD_RECORD_NUMBER, FIELD_OVERFLOW, FILE_ALREADY_EXISTS, FILE_ALREADY_OPEN, FILE_NOT_FOUND, INPUT_PAST_END_OF_FILE, IOError, PATH_FILE_ACCESS_ERROR, PATH_NOT_FOUND } from "./Errors.ts";
import { FileAccessor, Handle, isSequentialWriteMode, Opener, OpenMode } from "./Files.ts";
import { BasePrinter } from "./Printer.ts";

export interface Disk extends Opener {
  getCurrentDirectory(): string;
  changeDirectory(path: string): void;
  makeDirectory(path: string): void;
  removeDirectory(path: string): void;
  listFiles(pattern: string): DiskEntry[];
  removeFiles(pattern: string): void;
  rename(oldPath: string, newPath: string): void;
  writeFile(path: string, file: DiskFile): void;
  readFile(path: string): DiskFile;
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

export interface DiskListener {
  updateDiskEntry(entry: DiskEntry): void;
}

export type DiskEntry =
  | DiskFile
  | DiskDirectory;

export class MemoryDrive implements Disk {
  drive: string;
  rootDirectory = directory('');
  currentDirectory: Path;
  handles: Map<string, Handle> = new Map();
  modified = false;

  constructor(drive: string = "C", private diskListener?: DiskListener) {
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
        throw new IOError(PATH_FILE_ACCESS_ERROR);
      }
      throw new IOError(PATH_NOT_FOUND);
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
      throw new IOError(PATH_NOT_FOUND);
    }
    if (entry.entries.size > 0) {
      throw new IOError(PATH_FILE_ACCESS_ERROR);
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
      throw new IOError(FILE_NOT_FOUND);
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
      throw new IOError(PATH_NOT_FOUND);
    }

    const [targetParent, targetName] = this.getParentDirectoryAndFileName(newPath);
    if (!targetParent.isDirectory || !targetName) {
      throw new IOError(PATH_NOT_FOUND);
    }
    if (targetParent.entries.get(targetName)) {
      throw new IOError(FILE_ALREADY_EXISTS);
    }
    sourceParent.entries.delete(sourceName);
    targetParent.entries.set(targetName, entry);
    entry.name = targetName;
    this.flush(sourceParent);
    this.flush(targetParent);
  }

  writeFile(path: string, file: DiskFile) {
    const target = parsePath(path, this.currentDirectory);
    const [parentDir, name] = splitPath(target);
    const parent = this.lookupOrThrow(parentDir);
    if (!parent.isDirectory || !name) {
      throw new IOError(PATH_NOT_FOUND);
    }
    if (!parent.isDirectory) {
      throw new Error('expecting directory');
    }
    file.name = name;
    parent.entries.set(file.name, file);
    this.flush(parent);
  }

  readFile(path: string): DiskFile {
    const target = parsePath(path, this.currentDirectory);
    const [parentDir, name] = splitPath(target);
    const parent = this.lookupOrThrow(parentDir);
    if (!parent.isDirectory || !name) {
      throw new Error('expecting directory');
    }
    const file = parent.entries.get(name);
    if (!file || file.isDirectory) {
      throw new Error('file not found');
    }
    return file;
  }

  open(path: string, mode: OpenMode, recordLength?: number): Handle {
    const target = parsePath(path, this.currentDirectory);
    const [parentDir, name] = splitPath(target);
    const parent = this.lookupOrThrow(parentDir);
    if (!parent.isDirectory || !name) {
      throw new IOError(PATH_NOT_FOUND);
    }
    const canonPath = target.names.join('\\');
    if (this.handles.has(canonPath)) {
      throw new IOError(FILE_ALREADY_OPEN);
    }
    let file = parent.entries.get(name);
    if (!file || mode === OpenMode.OUTPUT) {
      if (mode === OpenMode.INPUT) {
        throw new IOError(FILE_NOT_FOUND);
      }
      file = {isDirectory: false, name, bytes: []};
      parent.entries.set(name, file);
      this.flush(file);
    }
    if (file.isDirectory) {
      throw new IOError(PATH_FILE_ACCESS_ERROR);
    }
    const fsHandle: MemoryDriveFileHandle = {
      canonPath,
      dirty: () => this.flush(file),
    };
    const handle = {
      owner: this,
      data: fsHandle,
      accessor: new MemoryDriveFileAccessor(fsHandle, file, mode, recordLength),
      fields: [],
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
    this.diskListener?.updateDiskEntry(entry);
  }

  private getParentDirectoryAndFileName(path: string, allowEmptyName = false): [DiskDirectory, string] {
    const target = parsePath(path, this.currentDirectory);
    const [parentDir, name] = splitPath(target);
    const parent = this.lookupOrThrow(parentDir);
    if (!parent.isDirectory || (!allowEmptyName && !name)) {
      throw new IOError(PATH_NOT_FOUND);
    }
    return [parent, name];
  }

  private lookupOrThrow(path: Path): DiskEntry {
    if (path.names.length === 0 || path.names[0] !== '') {
      throw new IOError(PATH_NOT_FOUND);
    }
    let entry: DiskEntry = this.rootDirectory;
    for (const name of path.names.slice(1)) {
      if (!entry.isDirectory) {
        throw new IOError(PATH_NOT_FOUND);
      }
      const next = entry.entries.get(name);
      if (!next) {
        throw new IOError(PATH_NOT_FOUND);
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
  recordBuffer: number[];

  constructor(handle: MemoryDriveFileHandle, file: DiskFile, mode: OpenMode, recordLength?: number) {
    super(65535);  // No width set by default
    this.handle = handle;
    this.file = file;
    this.mode = mode;
    this.recordLength = recordLength ?? (mode === OpenMode.RANDOM ? 128 : 1);
    this.lastAccessPosition = 0;
    this.position = this.mode === OpenMode.APPEND ? this.file.bytes.length : 0;
    this.recordBuffer = new Array(this.recordLength).fill(0);
  }

  openMode(): OpenMode {
    return this.mode;
  }

  seek(pos: number) {
    if (pos <= 0) {
      throw new IOError(BAD_RECORD_NUMBER);
    }
    this.position = pos - 1;
  }

  private readBytes(buffer: number[], position?: number) {
    if (position !== undefined) {
      this.seek(position);
    }
    this.lastAccessPosition = this.position;
    buffer.fill(0);
    if (this.position >= this.file.bytes.length) {
      return;
    }
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = this.file.bytes[this.position++];
      if (this.position >= this.file.bytes.length) {
        break;
      }
    }
  }

  private writeBytes(bytes: number[], position?: number) {
    if (position !== undefined) {
      this.seek(position);
    }
    this.lastAccessPosition = this.position;
    if (this.position >= this.file.bytes.length) {
      const padding = this.position - this.file.bytes.length;
      this.file.bytes.push(...zeros(padding));
    }
    this.file.bytes.splice(this.position, bytes.length, ...bytes);
  }

  getRecordBuffer(): number[] {
    if (this.openMode() !== OpenMode.RANDOM) {
      throw new IOError(BAD_FILE_MODE);
    }
    return this.recordBuffer;
  }

  getRecord(recordNumber?: number) {
    if (this.openMode() !== OpenMode.RANDOM) {
      throw new IOError(BAD_FILE_MODE);
    }
    const position = recordNumber && (1 + (recordNumber - 1) * this.recordLength);
    this.readBytes(this.recordBuffer, position);
  }

  putRecord(recordNumber?: number) {
    if (this.openMode() !== OpenMode.RANDOM) {
      throw new IOError(BAD_FILE_MODE);
    }
    const position = recordNumber && (1 + (recordNumber - 1) * this.recordLength);
    this.writeBytes(this.recordBuffer, position);
  }

  getBytes(numBytes: number, position?: number): number[] {
    if (this.openMode() !== OpenMode.BINARY) {
      throw new IOError(BAD_FILE_MODE);
    }
    const result = new Array(numBytes);
    this.readBytes(result, position);
    return result;
  }

  putBytes(bytes: number[], position?: number) {
    if (this.openMode() !== OpenMode.BINARY) {
      throw new IOError(BAD_FILE_MODE);
    }
    this.writeBytes(bytes, position);
  }

  putChar(ch: string) {
    if (this.mode === OpenMode.RANDOM) {
      return;
    }
    if (!isSequentialWriteMode(this.openMode())) {
      throw new IOError(BAD_FILE_MODE);
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
      throw new IOError(BAD_FILE_MODE);
    }
    if (this.mode === OpenMode.RANDOM) {
      return asciiToString(zeros(numBytes));
    }
    if (this.position + numBytes > this.file.bytes.length) {
      throw new IOError(INPUT_PAST_END_OF_FILE);
    }
    const start = this.position;
    this.lastAccessPosition = this.position + numBytes - 1;
    this.position += numBytes;
    return asciiToString(this.file.bytes.slice(start, this.position));
  }

  readLine(): string {
    if (this.mode === OpenMode.RANDOM) {
      throw new IOError(FIELD_OVERFLOW);
    }
    if (this.mode !== OpenMode.INPUT) {
      throw new IOError(BAD_FILE_MODE);
    }
    if (this.eof()) {
      throw new IOError(INPUT_PAST_END_OF_FILE);
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
    if (this.mode === OpenMode.RANDOM) {
      return Math.floor(this.lastAccessPosition / this.recordLength) + 1;
    }
    if (this.mode === OpenMode.BINARY) {
      return this.lastAccessPosition + 1;
    }
    return Math.floor((this.lastAccessPosition + 1) / 128);
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
      throw new IOError(PATH_NOT_FOUND);
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
    throw new IOError(PATH_NOT_FOUND);
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