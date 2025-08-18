import { RuntimeError, TYPE_MISMATCH } from "../Errors.ts";
import { StorageType } from "../Memory.ts";
import { Type, TypeTag } from "../Types.ts";
import { array, string } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { getArrayDescriptor } from "./Arrays.ts";
import { writeBytesToVariable } from "./Bits.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";

export class CommonStatement extends Statement {
  constructor(private result: Variable) {
    super();
  }

  override execute(context: ExecutionContext) {
    const value = context.common.assign(this.result);
    if (!value) {
      return;
    }
    if (!compatibleScalarType(this.result.type, value.type)) {
      throw RuntimeError.fromToken(this.startToken!, TYPE_MISMATCH);
    }
    const isResultArray = !!this.result.array;
    const isValueArray = (value.dimensions?.length ?? 0) > 0;
    if (isResultArray !== isValueArray) {
      throw RuntimeError.fromToken(this.startToken!, TYPE_MISMATCH);
    }
    if (this.result.array && value.dimensions) {
      const descriptor = getArrayDescriptor(this.result, context.memory);
      if (descriptor.dynamic) {
        // QBasic seems to just copy the array descriptor and share heap, but we
        // need to reallocate on the current program's heap.
        const baseAddress = context.memory.allocate(value.bytes.byteLength);
        const newDescriptor = array(this.result, {
          storageType: StorageType.DYNAMIC,
          valuesPerItem: this.result.array.valuesPerItem,
          dynamic: true,
          baseAddress,
          dimensions: [...value.dimensions],
        });
        context.memory.write(this.result, newDescriptor);
      } else {
        if (descriptor.dimensions.length !== value.dimensions.length ||
            !descriptor.dimensions.every((bound, index) => (
              bound.lower === value.dimensions![index].lower &&
              bound.upper === value.dimensions![index].upper
            ))) {
          throw RuntimeError.fromToken(this.startToken!, TYPE_MISMATCH);
        }
      }
    }
    if (!this.result.array && this.result.type.tag === TypeTag.STRING && value.bytes.byteLength > 0) {
      context.memory.write(this.result, string("\x00".repeat(value.bytes.byteLength)));
    }
    writeBytesToVariable(this.result, value.bytes, context.memory)
  }
}

function compatibleScalarType(s: Type, t: Type): boolean {
  if (s.tag === TypeTag.FIXED_STRING && t.tag === TypeTag.FIXED_STRING) {
    return s.maxLength === t.maxLength;
  }
  // This check requires record types to match exactly, but QBasic allows
  // merging or reordering adjacent string fields as long as the total length is
  // the same.
  if (s.tag === TypeTag.RECORD && t.tag === TypeTag.RECORD &&
      s.elements.length === t.elements.length &&
      s.elements.every((element, index) => compatibleScalarType(element.type, t.elements[index].type))) {
    return true;
  }
  return s.tag === t.tag;
}