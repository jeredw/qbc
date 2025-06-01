import { BuiltinStatementArgs } from "../Builtins.ts";
import { RuntimeError, OVERFLOW } from "../Errors.ts";
import { integer, isNumeric, Value } from "../Values.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { ExecutionContext } from "./ExecutionContext.ts";

export class InpFunction extends BuiltinFunction1 {
  constructor(args: BuiltinStatementArgs) {
    super(args);
  }

  override calculate(input: Value, context: ExecutionContext): Value {
    if (!isNumeric(input)) {
      throw new Error("expecting number");
    }
    const portSpec = input.number;
    if (portSpec < -65536 || portSpec > 65535) {
      throw RuntimeError.fromToken(this.token, OVERFLOW);
    }
    const port = portSpec & 0xffff;
    if (port === 0x60) {
      const code = context.devices.keyboard.getLastScanCode();
      return integer(code);
    }
    return integer(0);
  }
}