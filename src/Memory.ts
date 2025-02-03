import { isReference, Value } from "./Values";

export enum StorageType {
  STATIC,
  STACK,
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

  constructor(size: number) {
    this.static = new Frame(size);
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
    let value = this.read(address);
    while (value && isReference(value)) {
      address = value.address;
      value = this.read(value.address);
    }
    return [address, value];
  }

  read(address: Address): Value {
    switch (address.storageType) {
      case StorageType.STACK:
        if (this.stack.length == 0) {
          throw new Error("stack empty");
        }
        const frameIndex = address.frameIndex !== undefined ? address.frameIndex : this.getStackFrameIndex();
        return this.stack[frameIndex].read(address.index);
      case StorageType.STATIC:
        return this.static.read(address.index);
    }
  }

  write(address: Address, value: Value) {
    switch (address.storageType) {
      case StorageType.STACK:
        if (this.stack.length == 0) {
          throw new Error("stack empty");
        }
        const frameIndex = address.frameIndex !== undefined ? address.frameIndex : this.getStackFrameIndex();
        return this.stack[frameIndex].write(address.index, value);
      case StorageType.STATIC:
        return this.static.write(address.index, value);
    }
  }
}