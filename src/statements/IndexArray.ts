import { ExprContext } from "../../build/QBasicParser.ts";
import { RuntimeError } from "../Errors.ts";
import { evaluateExpression } from "../Expressions.ts";
import { TypeTag } from "../Types.ts";
import { isError, isNumeric, reference, SUBSCRIPT_OUT_OF_RANGE, TYPE_MISMATCH } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";

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
    let offset = 0;
    let stride = this.array.itemSize!;
    for (let i = 0; i < this.indexExprs.length; i++) {
      const expr = this.indexExprs[i];
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
      const index = value.number;
      const bounds = this.array.arrayDimensions![i];
      if (bounds.lower === undefined || bounds.upper === undefined) {
        throw new Error("array bounds undefined");
      }
      if (index < bounds.lower || index > bounds.upper) {
        throw RuntimeError.fromToken(expr.start!, SUBSCRIPT_OUT_OF_RANGE);
      }
      offset += stride * (index - bounds.lower);
      stride *= 1 + bounds.upper - bounds.lower;
    }
    if (this.array.address === undefined) {
      throw new Error("array is not allocated");
    }
    if (this.result.address === undefined) {
      throw new Error("result ref is not allocated");
    }
    context.memory.write(this.result.address, reference(this.array, {
      storageType: this.array.storageType,
      frameIndex: this.array.address.frameIndex,
      index: this.array.address.index + offset
    }));
  }
}