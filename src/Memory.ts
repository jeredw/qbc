import { isReference, Value } from "./Values.ts";

export enum StorageType {
  STATIC,
  STACK,
  DYNAMIC,
}

export interface Address {
  storageType: StorageType;
  frameIndex?: number;
  index: number;
}

export class Frame {
  values: Value[] = [];
  live: boolean = true;

  constructor(size: number) {
    this.values = new Array(size);
    this.live = true;
  }

  read(index: number): Value {
    this.check(index);
    return this.values[index];
  }

  write(index: number, value: Value) {
    this.check(index);
    this.values[index] = value;
  }

  dispose() {
    this.values = [];
    this.live = false;
  }

  private check(index: number) {
    if (!this.live) {
      throw new Error("frame is not live");
    }
    if (index >= this.values.length) {
      throw new Error("index out of bounds");
    }
  }
}

export class Memory {
  static: Frame;
  stack: Frame[] = [];
  dynamic: Frame[] = [];

  constructor(size: number) {
    this.static = new Frame(size);
    this.dynamic = [];
  }

  pushStack(size: number) {
    this.stack.push(new Frame(size));
  }

  popStack() {
    if (this.stack.length == 0) {
      throw new Error("stack empty");
    }
    this.stack[this.stack.length - 1].dispose();
    this.stack.pop();
  }

  getStackFrameIndex(): number {
    return this.stack.length - 1;
  }

  dereference(address: Address): [Address, Value] {
    const MAX_DEPTH = 1000;
    let depth = 0;
    let value = this.read(address);
    while (value && isReference(value) && depth < MAX_DEPTH) {
      address = value.address;
      value = this.read(value.address);
      depth++;
    }
    if (depth == MAX_DEPTH) {
      throw new Error("probable reference cycle");
    }
    return [address, value];
  }

  allocate(size: number): Address {
    const frameIndex = this.dynamic.length;
    this.dynamic.push(new Frame(size));
    return {storageType: StorageType.DYNAMIC, frameIndex, index: 0};
  }

  deallocate(address: Address) {
    if (address.storageType != StorageType.DYNAMIC) {
      throw new Error("tried to free non-dynamic memory");
    }
    this.getDynamicFrame(address.frameIndex).dispose();
  }

  read(address: Address): Value {
    switch (address.storageType) {
      case StorageType.STACK:
        return this.getStackFrame(address.frameIndex).read(address.index);
      case StorageType.STATIC:
        return this.static.read(address.index);
      case StorageType.DYNAMIC:
        return this.getDynamicFrame(address.frameIndex).read(address.index);
    }
  }

  write(address: Address, value: Value) {
    switch (address.storageType) {
      case StorageType.STACK:
        return this.getStackFrame(address.frameIndex).write(address.index, value);
      case StorageType.STATIC:
        return this.static.write(address.index, value);
      case StorageType.DYNAMIC:
        return this.getDynamicFrame(address.frameIndex).write(address.index, value);
    }
  }

  private getStackFrame(frameIndexFromAddress: number | undefined): Frame {
    const frameIndex = frameIndexFromAddress !== undefined ?
      frameIndexFromAddress : this.getStackFrameIndex();
    if (frameIndex < 0 || frameIndex >= this.stack.length) {
      throw new Error("illegal stack frame");
    }
    return this.stack[frameIndex];
  }

  private getDynamicFrame(frameIndex: number | undefined): Frame {
    if (frameIndex === undefined) {
      throw new Error("missing frame index");
    }
    if (frameIndex < 0 || frameIndex >= this.dynamic.length) {
      throw new Error("illegal dynamic frame");
    }
    return this.dynamic[frameIndex];
  }
}