import { Token } from "antlr4ng";
import { ExprContext } from "../../build/QBasicParser.ts";
import { RuntimeError, DUPLICATE_DEFINITION, SUBSCRIPT_OUT_OF_RANGE } from "../Errors.ts";
import { evaluateIntegerExpression } from "../Expressions.ts";
import { Memory, StorageType } from "../Memory.ts";
import { array, integer, isArray, isError, isNumeric, isReference, reference, Value } from "../Values.ts";
import { ArrayBounds, ArrayDescriptor, getScalarVariableSizeInBytes, Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";
import { TypeTag } from "../Types.ts";
import { readElementToBytes, writeBytesToElement } from "./Bits.ts";

export interface DimBoundsExprs {
  lower?: ExprContext;
  upper: ExprContext;
}

export class DimStatement extends Statement {
  constructor(
    private arrayBaseIndex: number,
    private token: Token,
    private bounds: DimBoundsExprs[],
    private result: Variable,
    private redim: boolean
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    if (!this.result.array || (!this.result.isParameter && !this.result.array.dynamic)) {
      throw new Error("dim of non-dynamic array");
    }
    if (!this.result.address) {
      throw new Error("result ref not allocated");
    }
    const oldDescriptor = getArrayDescriptor(this.result, context.memory);
    if (oldDescriptor.baseAddress) {
      if (!oldDescriptor.dynamic) {
        // This can happen when REDIMing a static array passed as an array parameter.
        throw RuntimeError.fromToken(this.token, DUPLICATE_DEFINITION);
      }
      if (!this.redim) {
        throw RuntimeError.fromToken(this.token, DUPLICATE_DEFINITION);
      }
      context.memory.deallocate(oldDescriptor.baseAddress);
    }
    const dimensions: ArrayBounds[] = [];
    let numElements = 1;
    for (const boundsExprs of this.bounds) {
      const lower = boundsExprs.lower ?
        evaluateIntegerExpression(boundsExprs.lower, context.memory) :
        this.arrayBaseIndex;
      const upper = evaluateIntegerExpression(boundsExprs.upper, context.memory);
      if (upper < lower) {
        throw RuntimeError.fromToken(boundsExprs.upper.start!, SUBSCRIPT_OUT_OF_RANGE);
      }
      dimensions.push({lower, upper});
      numElements *= 1 + upper - lower;
    }
    if (numElements > 65535) {
      throw RuntimeError.fromToken(this.token, SUBSCRIPT_OUT_OF_RANGE);
    }
    const valuesPerItem = this.result.array.valuesPerItem ?? 1;
    const baseAddress = context.memory.allocate(numElements * valuesPerItem);
    const descriptor = array(this.result, {
      storageType: StorageType.DYNAMIC,
      valuesPerItem: this.result.array.valuesPerItem,
      dynamic: true,
      baseAddress,
      dimensions
    });
    context.memory.write(this.result, descriptor);
  }
}

export class EraseStatement extends Statement {
  constructor(private array: Variable) {
    super();
  }

  override execute(context: ExecutionContext) {
    const descriptor = getArrayDescriptor(this.array, context.memory);
    descriptor.buffer = undefined;
    descriptor.bufferDirty = false;
    if (!descriptor.baseAddress) {
      return;
    }
    if (descriptor.dynamic) {
      context.memory.deallocate(descriptor.baseAddress);
      context.memory.write(this.array, array(this.array, {dimensions: []}))
      return;
    }
    const numValues = getNumItemsInArray(descriptor) * (descriptor.valuesPerItem ?? 1);
    for (let i = 0; i < numValues; i++) {
      context.memory.writeAddress({
        storageType: descriptor.storageType!,
        frameIndex: descriptor.baseAddress!.frameIndex,
        index: descriptor.baseAddress!.index + i
      }, undefined);
    }
  }
}

export class IndexArrayStatement extends Statement {
  constructor(
    private array: Variable,
    private indexExprs: ExprContext[],
    private result: Variable,
    private forPointer: boolean,
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const descriptor = getArrayDescriptor(this.array, context.memory);
    let offset = this.array.recordOffset?.offset || 0;
    let stride = descriptor.valuesPerItem!;
    // Array shape isn't checked at compile time for parameters.
    if (descriptor.dimensions.length !== this.indexExprs.length) {
      throw RuntimeError.fromToken(this.indexExprs[0].start!, SUBSCRIPT_OUT_OF_RANGE);
    }
    if (!this.forPointer) {
      // read/write access through indexing invalidates any cached array bytes.
      // TODO: Reads should not invalidate.
      invalidateBuffer(this.array, context.memory);
    }
    // Note that arrays are stored in column major order, so A(0, 0) is adjacent to A(1, 0).
    for (let i = 0; i < this.indexExprs.length; i++) {
      const expr = this.indexExprs[i];
      const index = evaluateIntegerExpression(expr, context.memory);
      const bounds = descriptor.dimensions[i];
      if (bounds.lower === undefined || bounds.upper === undefined) {
        throw new Error("array bounds undefined");
      }
      if (index < bounds.lower || index > bounds.upper) {
        throw RuntimeError.fromToken(expr.start!, SUBSCRIPT_OUT_OF_RANGE);
      }
      offset += stride * (index - bounds.lower);
      stride *= 1 + bounds.upper - bounds.lower;
    }
    if (this.result.address === undefined) {
      throw new Error("result ref is not allocated");
    }
    if (!descriptor.baseAddress) {
      throw new Error("array not allocated");
    }
    // TODO: arraryOffsetInBytes is incorrect for record arrays with an element.
    const bytesPerItem = getBytesPerItem(this.array, context.memory);
    context.memory.writeAddress(this.result.address, reference(this.array, {
      storageType: descriptor.storageType!,
      frameIndex: descriptor.baseAddress!.frameIndex,
      index: descriptor.baseAddress!.index + offset,
      arrayOffsetInBytes: offset * bytesPerItem,
    }));
  }
}

abstract class ArrayBoundFunction extends Statement {
  constructor(
    protected token: Token,
    protected array: Variable,
    protected result: Variable,
    protected whichExpr?: ExprContext
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const which =
      this.whichExpr ? evaluateIntegerExpression(this.whichExpr, context.memory) : 1;
    const output = this.getBound(context, which);
    if (isError(output)) {
      throw RuntimeError.fromToken(this.token, output);
    }
    context.memory.write(this.result, output);
  }

  abstract getBound(context: ExecutionContext, which: number): Value;
}

export class LboundFunction extends ArrayBoundFunction {
  constructor(token: Token, array: Variable, result: Variable, whichExpr?: ExprContext) {
    super(token, array, result, whichExpr);
  }

  override getBound(context: ExecutionContext, which: number): Value {
    const descriptor = getArrayDescriptor(this.array, context.memory);
    if (which == 0) {
      return integer(0);
    }
    if (which < 0 || which > descriptor.dimensions.length) {
      throw RuntimeError.fromToken(this.token, SUBSCRIPT_OUT_OF_RANGE);
    }
    const lower = descriptor.dimensions[which - 1].lower;
    if (lower === undefined) {
      throw new Error("undefined array bound")
    }
    return integer(lower);
  }
}

export class UboundFunction extends ArrayBoundFunction {
  constructor(token: Token, array: Variable, result: Variable, whichExpr?: ExprContext) {
    super(token, array, result, whichExpr);
  }

  override getBound(context: ExecutionContext, which: number): Value {
    const descriptor = getArrayDescriptor(this.array, context.memory);
    if (which == 0) {
      return integer(-1);
    }
    if (which < 0 || which > descriptor.dimensions.length) {
      throw RuntimeError.fromToken(this.token, SUBSCRIPT_OUT_OF_RANGE);
    }
    const upper = descriptor.dimensions[which - 1].upper;
    if (upper === undefined) {
      throw new Error("undefined array bound")
    }
    return integer(upper);
  }
}

export function getArrayDescriptor(variable: Variable, memory: Memory): ArrayDescriptor {
  if (!variable.array) {
    throw new Error("not an array");
  }
  if (variable.isParameter) {
    // Array reference parameters may refer to different arrays in different
    // stack frames, so the parameter symbol doesn't contain the descriptor.
    // Instead we need to look at the reference on the stack.
    if (variable.recordOffset?.record) {
      // For record array elements, use the record array instead.
      variable = variable.recordOffset.record;
    }
    if (!variable.address) {
      throw new Error("missing address for array ref param");
    }
    // Note: CallStatement guarantees we only ever create one level of array
    // references.
    const arrayRef = memory.readAddress(variable.address);
    if (!arrayRef || !isReference(arrayRef) || !arrayRef.variable.array) {
      throw new Error("expecting array reference");
    }
    if (!arrayRef.variable.array.dynamic) {
      return arrayRef.variable.array;
    }
    // Fall through to dereference dynamic array descriptor.
  } else if (!variable.array.dynamic) {
    return variable.array;
  }
  const [_, value] = memory.dereference(variable);
  if (!value) {
    return {dimensions: [], dynamic: true};
  }
  if (!isArray(value)) {
    throw new Error("expecting array value");
  }
  if (!value.descriptor) {
    throw new Error("missing array descriptor");
  }
  return value.descriptor;
}

function getNumItemsInArray(descriptor: ArrayDescriptor): number {
  return descriptor.dimensions.map((range) => {
    if (range.upper === undefined || range.lower === undefined) {
      throw new Error('expecting bounds to be defined');
    }
    return 1 + range.upper - range.lower;
  }).reduce((acc, current) => acc * current, 1);
}

function getDescriptorAndBaseIndex(array: Variable, memory: Memory): {
  array: Variable,
  baseIndex: number,
  descriptor: ArrayDescriptor
} {
  let baseIndex: number | undefined;
  if (!array.array) {
    const arrayRef = memory.readAddress(array.address!);
    if (!arrayRef || !isReference(arrayRef) || !arrayRef.variable) {
      throw new Error('expecting array reference');
    }
    array = arrayRef.variable;
    baseIndex = arrayRef.address.index;
  }
  if (array.recordOffset?.record) {
    array = array.recordOffset?.record;
  }
  const descriptor = getArrayDescriptor(array, memory);
  if (baseIndex === undefined) {
    baseIndex = descriptor.baseAddress!.index;
  }
  return {array, baseIndex, descriptor};
}

// Serializes a slice of an array as a JS array.
// Only used for PALETTE USING, assumes the array is a simple array of integers or longs.
export function readNumbersFromArraySlice(arrayOrRef: Variable, count: number, memory: Memory): number[] {
  const {descriptor, baseIndex} = getDescriptorAndBaseIndex(arrayOrRef, memory);
  const start = baseIndex - descriptor.baseAddress!.index;
  const length = getNumItemsInArray(descriptor);
  if (start + count > length) {
    throw new Error('Not enough items in array');
  }
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const value = memory.readAddress({
      storageType: descriptor.storageType!,
      frameIndex: descriptor.baseAddress!.frameIndex,
      index: baseIndex + i 
    });
    result.push(unwrapNumber(value));
  }
  return result;
}

function readEntireArrayToBytes(arrayOrRef: Variable, memory: Memory): ArrayBuffer {
  const {array, descriptor} = getDescriptorAndBaseIndex(arrayOrRef, memory);
  if (!descriptor.buffer) {
    const baseIndex = descriptor.baseAddress!.index;
    const numItems = getNumItemsInArray(descriptor);
    const valuesPerItem = descriptor.valuesPerItem!;
    const bytesPerItem = getBytesPerItem(array, memory);
    descriptor.buffer = new ArrayBuffer(numItems * bytesPerItem);
    const data = new DataView(descriptor.buffer);
    let offset = 0;
    let index = 0;
    let item = makeItemVariable(array, descriptor, baseIndex);
    while (index < numItems * valuesPerItem) {
      item.address!.index = baseIndex + index;
      offset += readElementToBytes(data, offset, item, memory);
      index += valuesPerItem;
    }
  }
  return descriptor.buffer;
}

// Serializes a slice of an array as bytes.
// If arrayOrRef is a reference from IndexArray, result is the slice of items
// beginning at that index. Otherwise result is the full array contents.
export function readArraySliceToBytes(arrayOrRef: Variable, memory: Memory): ArrayBuffer {
  const buffer = readEntireArrayToBytes(arrayOrRef, memory);
  const {array, descriptor, baseIndex} = getDescriptorAndBaseIndex(arrayOrRef, memory);
  const start = baseIndex - descriptor.baseAddress!.index;
  const bytesPerItem = getBytesPerItem(array, memory);
  return buffer.slice(start * bytesPerItem);
}

function invalidateBuffer(arrayOrRef: Variable, memory: Memory) {
  const {array, descriptor} = getDescriptorAndBaseIndex(arrayOrRef, memory);
  if (!descriptor.buffer) {
    return;
  }
  if (!descriptor.bufferDirty) {
    descriptor.buffer = undefined;
    return;
  }
  const baseIndex = descriptor.baseAddress!.index;
  const numItems = getNumItemsInArray(descriptor);
  const bytesPerItem = getBytesPerItem(array, memory);
  let buffer = descriptor.buffer;
  if (buffer.byteLength % bytesPerItem != 0) {
    const padded = new ArrayBuffer(bytesPerItem * Math.ceil(buffer.byteLength / bytesPerItem));
    new Uint8Array(padded).set(new Uint8Array(buffer));
    buffer = padded;
  }
  const bytesToWrite = Math.min(buffer.byteLength, numItems * bytesPerItem);
  const data = new DataView(buffer);
  let offset = 0;
  let index = 0;
  let item = makeItemVariable(array, descriptor, baseIndex);
  while (offset < bytesToWrite) {
    item.address!.index = baseIndex + index;
    offset += writeBytesToElement(item, data, offset, memory);
    index += descriptor.valuesPerItem!;
  }
}

// Copies bytes to a slice of an array.
// If arrayOrRef is a reference from IndexArray, copies bytes to the slice
// beginning at that index, otherwise to the start of the array.
export function writeBytesToArraySlice(arrayOrRef: Variable, buffer: ArrayBuffer, memory: Memory) {
  const data = new Uint8Array(buffer);
  const arrayBuffer = readEntireArrayToBytes(arrayOrRef, memory);
  const {array, descriptor, baseIndex} = getDescriptorAndBaseIndex(arrayOrRef, memory);
  const start = baseIndex - descriptor.baseAddress!.index;
  const bytesPerItem = getBytesPerItem(array, memory);
  const baseByteOffset = start * bytesPerItem;
  descriptor.bufferDirty = true;
  if (baseByteOffset + buffer.byteLength > arrayBuffer.byteLength) {
    // Lots of programs bload stuff slightly beyond array bounds. To help this work,
    // grow the buffer. We'll only truncate when it is invalidated.
    const grow = new Uint8Array(baseByteOffset + buffer.byteLength);
    grow.set(new Uint8Array(arrayBuffer));
    grow.set(data, baseByteOffset);
    descriptor.buffer = grow.buffer;
    return;
  }
  new Uint8Array(arrayBuffer).set(data, baseByteOffset);
}

// Makes a synthetic variable to refer to an item of an array so that we can reuse utilities
// to read and write variables as bytes.
function makeItemVariable(array: Variable, descriptor: ArrayDescriptor, baseIndex: number): Variable {
  let item: Variable = {
    ...array, address: {
      storageType: descriptor.storageType!,
      frameIndex: descriptor.baseAddress!.frameIndex,
      index: baseIndex
    }
  };
  updateRecordOffsets(array, item);
  return item;
}

function updateRecordOffsets(variable: Variable, record: Variable) {
  for (const [name, element] of variable.elements?.entries() ?? []) {
    const elementCopy = {...element};
    if (elementCopy.type.tag === TypeTag.RECORD) {
      updateRecordOffsets(elementCopy, record);
    } else {
      elementCopy.recordOffset! = {...elementCopy.recordOffset!};
      elementCopy.recordOffset.record = record;
      elementCopy.array = undefined;
    }
    variable.elements?.set(name, elementCopy);
  }
}

function getBytesPerItem(array: Variable, memory: Memory) {
  if (array.recordOffset?.record) {
    array = array.recordOffset?.record;
  }
  return getScalarVariableSizeInBytes(array, memory);
}

function unwrapNumber(value?: Value): number {
  if (!value) {
    return 0;
  }
  if (!isNumeric(value)) {
    throw new Error('value not a number');
  }
  return value.number;
}