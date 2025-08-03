import { ExprContext } from "../../build/QBasicParser.ts";
import { evaluateIntegerExpression } from "../Expressions.ts";
import { Mouse } from "../Mouse.ts";
import { TypeTag } from "../Types.ts";
import { getDefaultValue, integer, isNumeric } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { readBytesFromArray } from "./Arrays.ts";
import { readVariableToBytes, wrap16Bit } from "./Bits.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";

export interface CallAbsoluteParameter {
  variable?: Variable;
  expr?: ExprContext;
}

// 16k should be enough for anybody.
const RAM_SIZE = 0x4000;

export class CallAbsoluteStatement extends Statement {
  constructor(
    private procedureExpr: ExprContext,
    private params: CallAbsoluteParameter[]) {
    super();
  }

  override execute(context: ExecutionContext) {
    const procedure = context.memory.getSegment();
    // const offset = evaluateIntegerExpression(this.procedureExpr, context.memory, {tag: TypeTag.LONG});
    const {variable} = context.memory.readPointer(procedure);
    if (!variable) {
      throw new Error("Unknown pointer for CALL ABSOLUTE procedure.");
    }
    const bytes = variable.array ?
      readBytesFromArray(variable, context.memory) :
      readVariableToBytes(variable, context.memory);
    const cpu = new Basic86();
    // Install program.
    cpu.cs = 0x0100; cpu.ip = 0x0000;
    const code = new Uint8Array(bytes);
    for (let i = 0; i < code.byteLength; i++) {
      cpu.writeByte(cpu.cs, cpu.ip + i, code[i]);
    }
    cpu.ss = 0x03F0; cpu.sp = 0x0100;
    const PARAMETER_DS = 0x0200;
    cpu.ds = PARAMETER_DS;
    // Push parameters.
    for (let i = 0; i < this.params.length; i++) {
      cpu.pushWord(2 * i);
      const {variable, expr} = this.params[i];
      if (expr) {
        const value = evaluateIntegerExpression(expr, context.memory);
        cpu.writeWord(cpu.ds, 2 * i, value);
      } else if (variable) {
        const value = context.memory.read(variable) ?? getDefaultValue(variable);
        if (!isNumeric(value)) {
          throw new Error('Non-integer argument to CALL ABSOLUTE.');
        }
        cpu.writeWord(cpu.ds, 2 * i, value.number);
      }
    }
    // Push return address for far call.  This sentinel value will stop the CPU stepping.
    cpu.pushWord(0xffff);
    cpu.pushWord(0xffff);
    cpu.setInterruptHandler(0x33, new MouseHandler(context.devices.mouse));
    cpu.run({endCodeSegment: 0xffff, stepLimit: code.byteLength});
    // Store output parameter values.
    for (let i = 0; i < this.params.length; i++) {
      const {variable} = this.params[i];
      if (variable) {
        const value = cpu.readWord(PARAMETER_DS, 2 * i);
        context.memory.write(variable, integer(wrap16Bit(value)));
      }
    }
  }
}

export interface InterruptHandler {
  call(cpu: Basic86): void;
}

class Basic86 {
  ax = 0
  bx = 0
  cx = 0
  dx = 0
  ds = 0
  di = 0
  es = 0
  si = 0
  ss = 0
  sp = 0
  bp = 0
  cs = 0
  ip = 0
  interruptHandlers: Map<number, InterruptHandler> = new Map();
  memory: number[];

  constructor() {
    this.memory = new Array(RAM_SIZE).fill(0);
  }

  setInterruptHandler(vector: number, handler: InterruptHandler) {
    this.interruptHandlers.set(vector, handler);
  }

  run({endCodeSegment=0xffff, stepLimit=0}: {endCodeSegment: number, stepLimit: number}) {
    let steps = 0;
    while (this.cs !== endCodeSegment && (!stepLimit || steps < stepLimit)) {
      this.step();
      steps++;
    }
    if (stepLimit && steps >= stepLimit) {
      throw new Error("Exceeded max CPU steps");
    }
  }

  private step() {
    const ir = this.readByte(this.cs, this.ip++);
    switch (ir) {
      case 0x06:
        this.pushWord(this.es);
        break;
      case 0x07:
        this.es = this.popWord();
        break;
      case 0x16:
        this.pushWord(this.ss);
        break;
      case 0x17:
        this.ss = this.popWord();
        break;
      case 0x1e:
        this.pushWord(this.ds);
        break;
      case 0x1f:
        this.ds = this.popWord();
        break;
      case 0x50:
        this.pushWord(this.ax);
        break;
      case 0x51:
        this.pushWord(this.cx);
        break;
      case 0x52:
        this.pushWord(this.dx);
        break;
      case 0x53:
        this.pushWord(this.bx);
        break;
      case 0x54:
        this.pushWord(this.sp);
        break;
      case 0x55:
        this.pushWord(this.bp);
        break;
      case 0x56:
        this.pushWord(this.si);
        break;
      case 0x57:
        this.pushWord(this.di);
        break;
      case 0x58:
        this.ax = this.popWord();
        break;
      case 0x59:
        this.cx = this.popWord();
        break;
      case 0x5a:
        this.dx = this.popWord();
        break;
      case 0x5b:
        this.bx = this.popWord();
        break;
      case 0x5c:
        this.sp = this.popWord();
        break;
      case 0x5d:
        this.bp = this.popWord();
        break;
      case 0x5e:
        this.si = this.popWord();
        break;
      case 0x5f:
        this.di = this.popWord();
        break;
      case 0x89: {
        const arg = this.readByte(this.cs, this.ip++);
        switch (arg) {
          case 0x07:
            this.writeWord(this.ds, this.bx, this.ax);
            break;
          case 0x0f:
            this.writeWord(this.ds, this.bx, this.cx);
            break;
          case 0x17:
            this.writeWord(this.ds, this.bx, this.dx);
            break;
          case 0xe5:
            this.bp = this.sp;
            break;
          default:
            throw new Error(`Unrecognized argument ${ir}: ${arg}`);
        }
        break;
      }
      case 0x8b: {
        const arg = this.readByte(this.cs, this.ip++);
        switch (arg) {
          case 0x07:
            this.ax = this.readWord(this.ds, this.bx);
            break;
          case 0x0f:
            this.cx = this.readWord(this.ds, this.bx);
            break;
          case 0x17:
            this.dx = this.readWord(this.ds, this.bx);
            break;
          case 0x5e: {
            const offset = this.readByte(this.cs, this.ip++);
            this.bx = this.readWord(this.ss, this.bp + offset);
            break;
          }
          case 0xec:
            this.bp = this.sp;
            break;
          default:
            throw new Error(`Unrecognized argument ${ir}: ${arg}`);
        }
        break;
      }
      case 0x91:
        [this.cx, this.ax] = [this.ax, this.cx];
        break;
      case 0x92:
        [this.dx, this.ax] = [this.ax, this.dx];
        break;
      case 0x93:
        [this.cx, this.bx] = [this.ax, this.bx];
        break;
      case 0xb8: {
        const imm16 = this.readWord(this.cs, this.ip);
        this.ip += 2;
        this.ax = imm16;
        break;
      }
      case 0xca: {
        const discard = this.readWord(this.cs, this.ip);
        this.ip = this.popWord();
        this.cs = this.popWord();
        this.sp += discard;
        break;
      }
      case 0xcd: {
        const arg = this.readByte(this.cs, this.ip++);
        const handler = this.interruptHandlers.get(arg);
        if (!handler) {
          throw new Error(`No handler registered for interrupt ${arg}`);
        }
        handler.call(this);
        break;
      }
      default:
        throw new Error(`Unrecognized opcode ${ir}`);
    }
  }

  pushWord(value: number) {
    const b0 = value & 0xff;
    const b1 = (value >> 8) & 0xff;
    this.sp -= 2;
    this.writeByte(this.ss, this.sp, b0);
    this.writeByte(this.ss, this.sp + 1, b1);
  }

  popWord(): number {
    const b0 = this.readByte(this.ss, this.sp);
    const b1 = this.readByte(this.ss, this.sp + 1);
    this.sp += 2;
    return b0 + (b1 << 8);
  }

  readWord(segment: number, offset: number): number {
    const b0 = this.readByte(segment, offset);
    const b1 = this.readByte(segment, offset + 1);
    return b0 + (b1 << 8);
  }

  writeWord(segment: number, offset: number, value: number) {
    this.writeByte(segment, offset, value & 0xff);
    this.writeByte(segment, offset + 1, (value >> 8) & 0xff);
  }

  readByte(segment: number, offset: number): number {
    const address = linearAddress(segment, offset) & 0xffff;
    if (address > this.memory.length) {
      throw new Error('Read out of bounds');
    }
    return this.memory[address];
  }

  writeByte(segment: number, offset: number, value: number) {
    const address = linearAddress(segment, offset) & 0xffff;
    if (address > this.memory.length) {
      throw new Error('Write out of bounds');
    }
    this.memory[address] = value & 0xff;
  }
}

function linearAddress(segment: number, offset: number): number {
  return (segment << 4) | offset;
}

class MouseHandler implements InterruptHandler {
  constructor(private mouse: Mouse) {
  }

  call(cpu: Basic86) {
    switch (cpu.ax) {
      case 0:
        // It is probably a safe assumption that the user has a mouse, with at least two buttons...
        cpu.ax = 0xffff;
        cpu.bx = 2;
        break;
      case 1:
        this.mouse.showCursor();
        break;
      case 2:
        this.mouse.hideCursor();
        break;
      case 3: {
        const {x, y, buttonMask} = this.mouse.getState();
        cpu.bx = buttonMask;
        cpu.cx = x & 0xffff;
        cpu.dx = y & 0xffff;
        break;
      }
      case 4:
        // Ignore "move pointer", which is most often just used for initialization.
        // Thankfully, there is no sane way to do this on the modern web.
        break;
      case 5: {
        const {buttonMask} = this.mouse.getState();
        const {lastDownX, lastDownY, stickyDownCount} = this.mouse.getButtonState(cpu.bx, /* down= */ true);
        cpu.ax = buttonMask;
        cpu.bx = stickyDownCount;
        cpu.cx = lastDownX & 0xffff;
        cpu.dx = lastDownY & 0xffff;
        break;
      }
      case 6: {
        const {buttonMask} = this.mouse.getState();
        const {lastUpX, lastUpY, stickyUpCount} = this.mouse.getButtonState(cpu.bx, /* down= */ false);
        cpu.ax = buttonMask;
        cpu.bx = stickyUpCount;
        cpu.cx = lastUpX & 0xffff;
        cpu.dx = lastUpY & 0xffff;
        break;
      }
      case 7:
      case 8:
        // Just ignore range functions.
        break;
      default:
        throw new Error(`Unsupported mouse function ${cpu.ax}`);
    }
  }
}