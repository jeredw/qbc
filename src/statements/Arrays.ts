import { Token } from "antlr4ng";
import { ExprContext } from "../../build/QBasicParser.ts";
import { RuntimeError } from "../Errors.ts";
import { evaluateExpression } from "../Expressions.ts";
import { Address, StorageType } from "../Memory.ts";
import { TypeTag } from "../Types.ts";
import { array, ArrayValue, isArray, isError, isNumeric, reference, SUBSCRIPT_OUT_OF_RANGE, TYPE_MISMATCH } from "../Values.ts";
import { ArrayBounds, ArrayDescriptor, Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";

export interface DimBoundsExprs {
  lower?: ExprContext;
  upper: ExprContext;
}

export class DimStatement extends Statement {
  arrayBaseIndex: number;
  token: Token;
  bounds: DimBoundsExprs[];
  result: Variable;

  constructor(arrayBaseIndex: number, token: Token, bounds: DimBoundsExprs[], result: Variable) {
    super();
    this.arrayBaseIndex = arrayBaseIndex;
    this.token = token;
    this.bounds = bounds;
    this.result = result;
  }

  override execute(context: ExecutionContext) {
    if (!this.result.array || !this.result.array.dynamic) {
      throw new Error("dim of non-dynamic array");
    }
    if (!this.result.address) {
      throw new Error("result ref not allocated");
    }
    const [descriptorAddress, _] = context.memory.dereference(this.result);
    const dimensions: ArrayBounds[] = [];
    let numElements = 1;
    for (const boundsExprs of this.bounds) {
      const lower = boundsExprs.lower ? evaluateIntegerExpression(boundsExprs.lower, context) : this.arrayBaseIndex;
      const upper = evaluateIntegerExpression(boundsExprs.upper, context);
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
    const descriptor = array(this.result, {storageType: StorageType.DYNAMIC, baseAddress, dimensions});
    context.memory.write(descriptorAddress, descriptor);
  }
}

export class IndexArrayStatement extends Statement {
  array: Variable;
  indexExprs: ExprContext[];
  result: Variable;

  constructor(array: Variable, indexExprs: ExprContext[], result: Variable) {
    super();
    this.array = array;
    this.indexExprs = indexExprs;
    this.result = result;
  }

  override execute(context: ExecutionContext) {
    const descriptor = getArrayDescriptor(this.array, context);
    let offset = this.array.recordOffset?.offset || 0;
    let stride = descriptor.itemSize!;
    for (let i = 0; i < this.indexExprs.length; i++) {
      const expr = this.indexExprs[i];
      const index = evaluateIntegerExpression(expr, context);
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
    context.memory.write(this.result.address, reference(this.array, {
      storageType: descriptor.storageType!,
      frameIndex: descriptor.baseAddress!.frameIndex,
      index: descriptor.baseAddress!.index + offset
    }));
  }
}

function evaluateIntegerExpression(expr: ExprContext, context: ExecutionContext): number {
  const value = evaluateExpression({
    expr,
    resultType: {tag: TypeTag.INTEGER},
    memory: context.memory
  });
  if (isError(value)) {
    throw RuntimeError.fromToken(expr.start!, value);
  }
  if (!isNumeric(value)) {
    throw RuntimeError.fromToken(expr.start!, TYPE_MISMATCH);
  }
  return value.number;
}

function getArrayDescriptor(variable: Variable, context: ExecutionContext): ArrayDescriptor {
  if (!variable.array) {
    throw new Error("not an array");
  }
  if (!variable.array.dynamic) {
    return variable.array;
  }
  if (!variable.address) {
    throw new Error("variable not allocated");
  }
  const [_, value] = context.memory.dereference(variable);
  if (!isArray(value)) {
    throw new Error("expecting array value");
  }
  return value.descriptor;
}