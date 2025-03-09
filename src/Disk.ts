import { Device } from "./Devices.ts";
import { Handle } from "./Files.ts";

export interface Disk extends Device {
  open(name: string): Promise<Handle>;
}

interface MemoryFileHandle {
  id: number;
  name: string;
  closed?: boolean;
}

export class MemoryFileSystem implements Disk {
  files: Map<string, string> = new Map();
  handles: Map<number, string> = new Map();
  nextId: number = 0;

  installFile(name: string, contents: string) {
    this.files.set(name, contents);
  }

  async open(name: string): Promise<Handle> {
    const deviceHandle = {id: this.nextId++, name: name};
    this.handles.set(deviceHandle.id, name);
    return {device: this, deviceHandle};
  }

  async close(fileHandle: Handle) {
    (fileHandle as unknown as MemoryFileHandle).closed = true;
  }
}

export class OriginPrivateFileSystem implements Disk {
  async open(name: string): Promise<Handle> {
    const root = await navigator.storage.getDirectory();
    const deviceHandle = await root.getFileHandle(name, { create: true });
    return {device: this, deviceHandle};
  }

  async close(fileHandle: Handle) {
  }
}