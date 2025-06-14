import { isReference, Value } from "./Values.ts";
import { Variable } from "./Variables.ts";

export enum StorageType {
  STATIC,
  AUTOMATIC,
  DYNAMIC,
}

export interface Address {
  storageType: StorageType;
  frameIndex?: number;
  index: number;
}

export class Frame {
  values: (Value | undefined)[] = [];
  live: boolean = true;

  constructor(size: number) {
    this.values = new Array(size);
    this.live = true;
  }

  read(index: number): Value | undefined {
    this.check(index);
    return this.values[index];
  }

  write(index: number, value?: Value) {
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

export interface Pointer {
  address: Address;
  variable: Variable;
}

export class Memory {
  static: Frame;
  stack: Frame[] = [];
  dynamic: Frame[] = [];
  segment: number = 0;
  pointers: Pointer[] = [];

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

  dereference(variable: Variable): [Address, Value | undefined] {
    // If variable is an element in a record, dereference the record variable
    // first, then offset into it.
    let address = variable.recordOffset?.record.address ?? variable.address;
    if (!address) {
      throw new Error("invalid address");
    }
    const MAX_DEPTH = 1000;
    let depth = 0;
    let value = this.readAddress(address);
    while (value && isReference(value) && depth < MAX_DEPTH) {
      address = value.address;
      value = this.readAddress(value.address);
      depth++;
    }
    if (depth == MAX_DEPTH) {
      throw new Error("probable reference cycle");
    }
    // IndexArray handles element offsets into record arrays.
    if (variable.recordOffset && !variable.array) {
      address = {...address};
      address.index += variable.recordOffset.offset;
      value = this.readAddress(address);
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

  readAddress(address: Address): Value | undefined {
    switch (address.storageType) {
      case StorageType.AUTOMATIC:
        return this.getStackFrame(address.frameIndex).read(address.index);
      case StorageType.STATIC:
        return this.static.read(address.index);
      case StorageType.DYNAMIC:
        return this.getDynamicFrame(address.frameIndex).read(address.index);
    }
  }

  writeAddress(address: Address, value?: Value) {
    switch (address.storageType) {
      case StorageType.AUTOMATIC:
        return this.getStackFrame(address.frameIndex).write(address.index, value);
      case StorageType.STATIC:
        return this.static.write(address.index, value);
      case StorageType.DYNAMIC:
        return this.getDynamicFrame(address.frameIndex).write(address.index, value);
    }
  }

  read(variable: Variable): Value | undefined {
    const [_, value] = this.dereference(variable);
    return value;
  }

  write(variable: Variable, value: Value | undefined) {
    const [address, _] = this.dereference(variable);
    this.writeAddress(address, value);
  }

  getSegment(): number {
    return this.segment;
  }

  setSegment(segment: number) {
    this.segment = segment;
  }

  readPointer(index: number): Pointer {
    const entryIndex = index - 1;
    if (entryIndex < 0 || entryIndex >= this.pointers.length) {
      throw new Error("invalid pointer");
    }
    return this.pointers[entryIndex];
  }

  writePointer(address: Address, variable: Variable): number {
    if (this.pointers.length > 65535) {
      throw new Error("out of pointer space");
    }
    this.pointers.push({address, variable});
    return this.pointers.length;
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