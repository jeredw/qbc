import { Token } from "antlr4ng";
import { BuiltinStatementArgs } from "../Builtins.ts";
import { RuntimeError, OVERFLOW } from "../Errors.ts";
import { evaluateIntegerExpression, Expression } from "../Expressions.ts";
import { TypeTag } from "../Types.ts";
import { integer, isNumeric, Value } from "../Values.ts";
import { BuiltinFunction1 } from "./BuiltinFunction.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";
import { readVariableToBytes } from "./Bits.ts";

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
    if (context.devices.blaster.usesPort(port)) {
      return integer(context.devices.blaster.input(port));
    }
    switch (port) {
      case 0x201: {
        const [strobeCount, state] = context.devices.joystick.sample();
        const data = (
          (state[1]?.buttons[1] ? 0 : 0x80) |
          (state[1]?.buttons[0] ? 0 : 0x40) |
          (state[0]?.buttons[1] ? 0 : 0x20) |
          (state[0]?.buttons[0] ? 0 : 0x10) |
          (state[1]?.scaledAxes[1] > strobeCount ? 0x8 : 0) |
          (state[1]?.scaledAxes[0] > strobeCount ? 0x4 : 0) |
          (state[0]?.scaledAxes[1] > strobeCount ? 0x2 : 0) |
          (state[0]?.scaledAxes[0] > strobeCount ? 0x1 : 0)
        );
        return integer(data);
      }
      case 0x3c9:
        const data = context.devices.screen.getVgaPaletteData();
        return integer(data);
      case 0x3da:
        const inVgaRetrace = context.devices.timer.inVgaRetrace();
        return integer(inVgaRetrace ? 8 : 0);
      case 0x60:
        const code = context.devices.keyboard.getLastScanCode();
        return integer(code);
    }
    return integer(0);
  }
}

export class OutStatement extends Statement {
  private token: Token;
  private portExpr: Expression;
  private dataExpr: Expression;

  constructor(args: BuiltinStatementArgs) {
    super();
    this.token = args.token;
    this.portExpr = args.params[0].expr!;
    this.dataExpr = args.params[1].expr!;
  }

  override execute(context: ExecutionContext) {
    const portSpec = evaluateIntegerExpression(this.portExpr, context.memory, {tag: TypeTag.LONG});
    if (portSpec < -65536 || portSpec > 65535) {
      throw RuntimeError.fromToken(this.token, OVERFLOW);
    }
    const port = portSpec & 0xffff;
    // OUT quietly wraps when data is out of range.
    const data = evaluateIntegerExpression(this.dataExpr, context.memory) & 0xff;
    const {blaster} = context.devices;
    if (blaster.usesPort(port)) {
      const addressRequest = blaster.output(port, data);
      if (addressRequest !== undefined) {
        const segment = addressRequest >> 4;
        const {variable} = context.memory.readPointer(segment);
        const bytes = readVariableToBytes(variable, context.memory);
        blaster.sendData(bytes);
      }
      return;
    }
    switch (port) {
      case 0x201:
        context.devices.joystick.resetCount();
        break;
      case 0x3c7:
      case 0x3c8:
        context.devices.screen.setVgaPaletteIndex(data);
        break;
      case 0x3c9:
        context.devices.screen.setVgaPaletteData(data);
        break;
    }
  }
}