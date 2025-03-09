import { Device } from "./Devices.ts";
import { Handle } from "./Files.ts";
import { BasePrinter, StringPrinter } from "./Printer.ts";

export interface Disk extends Device {
  open(name: string): Promise<Handle>;
}

interface MemoryFileData {
  id: number;
  name: string;
  closed?: boolean;
}

export class MemoryFileSystem implements Disk {
  files: Map<string, string> = new Map();
  handles: Map<number, string> = new Map();
  nextId: number = 0;

  set(name: string, contents: string) {
    this.files.set(name, contents);
  }

  get(name: string): string | undefined {
    return this.files.get(name);
  }

  dump(): string {
    let output = "";
    for (const [name, contents] of this.files.entries()) {
      output += `file "${name}"\n`;
      output += `${contents}\n`;
    }
    return output;
  }

  async open(name: string): Promise<Handle> {
    const data: MemoryFileData = {id: this.nextId++, name};
    this.handles.set(data.id, name);
    return {
      device: this,
      data,
      printer: new StringPrinter()
    };
  }

  async close(handle: Handle) {
    const data = handle.data as MemoryFileData;
    const printer = handle.printer as StringPrinter;
    this.files.set(data.name, printer.output);
    data.closed = true;
  }
}

interface OpfsData {
  fileHandle: FileSystemHandle;
  writableStream: FileSystemWritableFileStream;
}

class OriginPrivateFilePrinter extends BasePrinter {
  stream: FileSystemWritableFileStream;

  constructor(stream: FileSystemWritableFileStream) {
    super(80)
    this.stream = stream;
  }

  override putChar(char: string) {
    this.stream.write(char);
  }
}

export class OriginPrivateFileSystem implements Disk {
  async open(name: string): Promise<Handle> {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(name, { create: true });
    const writableStream = await fileHandle.createWritable();
    const data: OpfsData = {fileHandle, writableStream};
    return {
      device: this,
      data,
      printer: new OriginPrivateFilePrinter(writableStream)
    };
  }

  async close(handle: Handle) {
    const data = handle.data as OpfsData;
    await data.writableStream.close();
  }
}