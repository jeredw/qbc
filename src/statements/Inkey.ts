import { BuiltinStatementArgs } from "../Builtins.ts";
import { Statement } from "./Statement.ts";
import { Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { string } from "../Values.ts";
import { asciiToString } from "../AsciiChart.ts";
import { isModifier } from "../ScanCodeChart.ts";

export class InkeyFunction extends Statement {
  result: Variable;

  constructor({result}: BuiltinStatementArgs) {
    super();
    if (!result) {
      throw new Error("expecting result")
    }
    this.result = result;
  }

  override execute(context: ExecutionContext) {
    const key = context.devices.keyboard.input();
    // Skip break codes for inkey$.
    const output = !key || (key.code & 0x80) || isModifier(key.code) ? string("") :
      key.char ? string(key.char) :
      string(asciiToString([0, key.code]));
    context.memory.write(this.result.address!, output);
  }
}