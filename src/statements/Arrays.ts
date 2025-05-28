import { Token } from "antlr4ng";
import { ExprContext } from "../../build/QBasicParser.ts";
import { RuntimeError } from "../Errors.ts";
import { evaluateIntegerExpression } from "../Expressions.ts";
import { Memory, StorageType } from "../Memory.ts";
import { array, double, DUPLICATE_DEFINITION, integer, isArray, isError, isNumeric, isReference, long, reference, single, SUBSCRIPT_OUT_OF_RANGE, Value } from "../Values.ts";
import { ArrayBounds, ArrayDescriptor, getScalarVariableSizeInBytes, Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";
import { TypeTag } from "../Types.ts";

export interface DimBoundsExprs {
  lower?: ExprContext;
  upper: ExprContext;
}

export class DimStatement extends Statement {
  constructor(
    private arrayBaseIndex: number,
    private token: Token,
    private bounds: DimBoundsExprs[],
    private result: Variable
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    if (!this.result.array || !this.result.array.dynamic) {
      throw new Error("dim of non-dynamic array");
    }
    if (!this.result.address) {
      throw new Error("result ref not allocated");
    }
    if (this.result.array.inStaticProcedure) {
      throw RuntimeError.fromToken(this.token, DUPLICATE_DEFINITION);
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
    const baseAddress = context.memory.allocate(numElements);
    const descriptor = array(this.result, {
      storageType: StorageType.DYNAMIC,
      itemSize: this.result.array.itemSize,
      baseAddress,
      dimensions
    });
    context.memory.write(this.result, descriptor);
  }
}

export class IndexArrayStatement extends Statement {
  constructor(
    private array: Variable,
    private indexExprs: ExprContext[],
    private result: Variable
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const descriptor = getArrayDescriptor(this.array, context.memory);
    let offset = this.array.recordOffset?.offset || 0;
    let stride = descriptor.itemSize!;
    // Array shape isn't checked at compile time for parameters.
    if (descriptor.dimensions.length !== this.indexExprs.length) {
      throw RuntimeError.fromToken(this.indexExprs[0].start!, SUBSCRIPT_OUT_OF_RANGE);
    }
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
    context.memory.writeAddress(this.result.address, reference(this.array, {
      storageType: descriptor.storageType!,
      frameIndex: descriptor.baseAddress!.frameIndex,
      index: descriptor.baseAddress!.index + offset
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

function getArrayDescriptor(variable: Variable, memory: Memory): ArrayDescriptor {
  if (!variable.array) {
    throw new Error("not an array");
  }
  if (!variable.array.dynamic) {
    return variable.array;
  }
  if (!variable.address) {
    throw new Error("variable not allocated");
  }
  const [_, value] = memory.dereference(variable);
  if (!isArray(value)) {
    throw new Error("expecting array value");
  }
  return value.descriptor;
}

function getArrayLength(descriptor: ArrayDescriptor): number {
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
    if (!isReference(arrayRef) || !arrayRef.variable) {
      throw new Error('expecting array reference');
    }
    array = arrayRef.variable;
    baseIndex = arrayRef.address.index;
  }
  const descriptor = getArrayDescriptor(array, memory);
  if (baseIndex === undefined) {
    baseIndex = descriptor.baseAddress!.index;
  }
  return {array, baseIndex, descriptor};
}

export function readNumbersFromArray(array: Variable, count: number, memory: Memory): number[] {
  const {descriptor, baseIndex} = getDescriptorAndBaseIndex(array, memory);
  const start = baseIndex - descriptor.baseAddress!.index;
  const length = getArrayLength(descriptor);
  if (start + count > length) {
    throw new Error('not enough elements in array');
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

export function readBytesFromArray(arrayOrRef: Variable, memory: Memory): ArrayBuffer {
  const {array, descriptor, baseIndex} = getDescriptorAndBaseIndex(arrayOrRef, memory);
  const start = baseIndex - descriptor.baseAddress!.index;
  const numItems = getArrayLength(descriptor) - start;
  const bytesPerItem = getScalarVariableSizeInBytes(array, memory);
  const result = new ArrayBuffer(numItems * bytesPerItem);
  const data = new DataView(result);
  const littleEndian = true;
  let offset = 0;
  for (let i = 0; i < numItems; i++) {
    const value = memory.readAddress({
      storageType: descriptor.storageType!,
      frameIndex: descriptor.baseAddress!.frameIndex,
      index: baseIndex + i
    });
    const item = unwrapNumber(value);
    switch (array.type.tag) {
      case TypeTag.INTEGER:
        data.setUint16(offset, item, littleEndian);
        offset += 2;
        break;
      case TypeTag.LONG:
        data.setUint32(offset, item, littleEndian);
        offset += 4;
        break;
      case TypeTag.SINGLE:
        data.setFloat32(offset, item, littleEndian);
        offset += 4;
        break;
      case TypeTag.DOUBLE:
        data.setFloat64(offset, item, littleEndian);
        offset += 8;
        break;
      default:
        throw new Error('unsupported type');
    }
  }
  return result;
}

export function writeBytesToArray(arrayOrRef: Variable, buffer: ArrayBuffer, memory: Memory) {
  const {array, descriptor, baseIndex} = getDescriptorAndBaseIndex(arrayOrRef, memory);
  const start = baseIndex - descriptor.baseAddress!.index;
  const numItems = getArrayLength(descriptor) - start;
  const bytesPerItem = getScalarVariableSizeInBytes(array, memory);
  if (buffer.byteLength % bytesPerItem != 0) {
    const padded = new ArrayBuffer(bytesPerItem * Math.ceil(buffer.byteLength / bytesPerItem));
    new Uint8Array(padded).set(new Uint8Array(buffer));
    buffer = padded;
  }
  if (buffer.byteLength > numItems * bytesPerItem) {
    throw new Error('not enough room in array');
  }
  const data = new DataView(buffer);
  const littleEndian = true;
  let offset = 0;
  let index = 0;
  while (offset < buffer.byteLength) {
    let value: Value;
    switch (array.type.tag) {
      case TypeTag.INTEGER:
        value = integer(data.getInt16(offset, littleEndian));
        offset += 2;
        break;
      case TypeTag.LONG:
        value = long(data.getInt32(offset, littleEndian));
        offset += 4;
        break;
      case TypeTag.SINGLE:
        // Do not fround, use the bits we got.
        value = {tag: TypeTag.SINGLE, number: data.getFloat32(offset, littleEndian)};
        offset += 4;
        break;
      case TypeTag.DOUBLE:
        value = double(data.getFloat64(offset, littleEndian));
        offset += 8;
        break;
      default:
        throw new Error('unsupported type');
    }
    memory.writeAddress({
      storageType: descriptor.storageType!,
      frameIndex: descriptor.baseAddress!.frameIndex,
      index: baseIndex + index
    }, value);
    index++;
  }
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