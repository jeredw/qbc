import { Token } from "antlr4ng";
import { ExprContext } from "../../build/QBasicParser.ts";
import { RuntimeError } from "../Errors.ts";
import { evaluateIntegerExpression } from "../Expressions.ts";
import { Memory, StorageType } from "../Memory.ts";
import { array, DUPLICATE_DEFINITION, integer, isArray, isError, reference, SUBSCRIPT_OUT_OF_RANGE, Value } from "../Values.ts";
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
    if (this.result.array.inStaticProcedure) {
      throw RuntimeError.fromToken(this.token, DUPLICATE_DEFINITION);
    }
    const [descriptorAddress, _] = context.memory.dereference(this.result);
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
    const descriptor = getArrayDescriptor(this.array, context.memory);
    let offset = this.array.recordOffset?.offset || 0;
    let stride = descriptor.itemSize!;
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
    context.memory.write(this.result.address, reference(this.array, {
      storageType: descriptor.storageType!,
      frameIndex: descriptor.baseAddress!.frameIndex,
      index: descriptor.baseAddress!.index + offset
    }));
  }
}

abstract class ArrayBoundFunction extends Statement {
  token: Token;
  array: Variable;
  whichExpr: ExprContext | undefined;
  result: Variable;

  constructor(token: Token, array: Variable, result: Variable, whichExpr?: ExprContext) {
    super();
    this.token = token;
    this.array = array;
    this.whichExpr = whichExpr;
    this.result = result;
  }

  override execute(context: ExecutionContext) {
    const which =
      this.whichExpr ? evaluateIntegerExpression(this.whichExpr, context.memory) : 1;
    const output = this.getBound(context, which);
    if (isError(output)) {
      throw RuntimeError.fromToken(this.token, output);
    }
    context.memory.write(this.result.address!, output);
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