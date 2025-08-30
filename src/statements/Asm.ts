import { asciiToString } from "../AsciiChart.ts";
import { evaluateIntegerExpression, Expression } from "../Expressions.ts";
import { SBMIDI_SEGMENT, SBSIM_SEGMENT } from "../BakedInData.ts";
import { Mouse } from "../Mouse.ts";
import { getDefaultValue, integer, isNumeric } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { readVariableToBytes, signExtend16Bit, writeBytesToVariable } from "./Bits.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { readEntireFile } from "./FileSystem.ts";
import { Statement } from "./Statement.ts";

export interface CallAbsoluteParameter {
  variable?: Variable;
  expr?: Expression;
}

// 16k should be enough for anybody.
const RAM_SIZE = 0x4000;

export class CallAbsoluteStatement extends Statement {
  constructor(
    private procedureExpr: Expression,
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
    const bytes = readVariableToBytes(variable, context.memory);
    const cpu = new Basic86();
    // Install program.
    cpu.cs = 0x0100;
    cpu.ip = 0x0000;
    const code = patch(new Uint8Array(bytes));
    for (let i = 0; i < code.byteLength; i++) {
      cpu.writeByte(cpu.cs, cpu.ip + i, code[i]);
    }
    cpu.ss = 0x03F0;
    cpu.sp = 0x0100;
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
    cpu.setInterruptHandler(0x21, new DosHandler(context));
    cpu.setInterruptHandler(0x33, new MouseHandler(context.devices.mouse));
    cpu.setInterruptHandler(0x80, new MidiHandler(context));
    cpu.setInterruptHandler(0x81, new MidiHandler(context));
    cpu.run({endCodeSegment: 0xffff, stepLimit: code.byteLength});
    // Store output parameter values.
    for (let i = 0; i < this.params.length; i++) {
      const {variable} = this.params[i];
      if (variable) {
        const value = cpu.readWord(PARAMETER_DS, 2 * i);
        context.memory.write(variable, integer(signExtend16Bit(value)));
      }
    }
  }
}

export interface InterruptHandler {
  call(cpu: Basic86): void;
}

// To simplify decoding, registers are stored in arrays and indexed by their
// modRM field index.
const AX = 0, CX = 1, DX = 2, BX = 3, SP = 4, BP = 5, SI = 6, DI = 7;
const ES = 0, CS = 1, SS = 2, DS = 3;
// A sentinel segment value meaning that a modRM byte addresses a register.
const REGISTER = -1;

// Simulates a small subset of 8086 instructions for the kinds of stuff people
// do in CALL ABSOLUTE.
class Basic86 {
  registers = new Uint16Array(8)
  segments = new Uint16Array(4)
  ip = 0
  interruptHandlers: Map<number, InterruptHandler> = new Map();
  memory: Uint8Array;

  get es(): number { return this.segments[ES]; }
  set es(value: number) { this.segments[ES] = value; }
  get cs(): number { return this.segments[CS]; }
  set cs(value: number) { this.segments[CS] = value; }
  get ss(): number { return this.segments[SS]; }
  set ss(value: number) { this.segments[SS] = value; }
  get ds(): number { return this.segments[DS]; }
  set ds(value: number) { this.segments[DS] = value; }

  get ax(): number { return this.registers[AX]; }
  set ax(value: number) { this.registers[AX] = value; }
  get cx(): number { return this.registers[CX]; }
  set cx(value: number) { this.registers[CX] = value; }
  get dx(): number { return this.registers[DX]; }
  set dx(value: number) { this.registers[DX] = value; }
  get bx(): number { return this.registers[BX]; }
  set bx(value: number) { this.registers[BX] = value; }
  get sp(): number { return this.registers[SP]; }
  set sp(value: number) { this.registers[SP] = value; }
  get bp(): number { return this.registers[BP]; }
  set bp(value: number) { this.registers[BP] = value; }
  get si(): number { return this.registers[SI]; }
  set si(value: number) { this.registers[SI] = value; }
  get di(): number { return this.registers[DI]; }
  set di(value: number) { this.registers[DI] = value; }

  constructor() {
    this.memory = new Uint8Array(RAM_SIZE);
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
    const ir = this.fetchByte();
    switch (ir) {
      // PUSH seg
      case 0o006:
      case 0o016:
      case 0o026:
      case 0o036:
        this.pushWord(this.getSegment(ir >> 3));
        break;
      // POP seg
      case 0o007:
      case 0o017:
      case 0o027:
      case 0o037:
        this.setSegment(ir >> 3, this.popWord());
        break;
      // PUSH reg
      case 0o120:
      case 0o121:
      case 0o122:
      case 0o123:
      case 0o124:
      case 0o125:
      case 0o126:
      case 0o127:
        this.pushWord(this.getRegisterWord(ir));
        break;
      // POP reg
      case 0o130:
      case 0o131:
      case 0o132:
      case 0o133:
      case 0o134:
      case 0o135:
      case 0o136:
      case 0o137:
        this.setRegisterWord(ir, this.popWord());
        break;
      // XCHG r8, r/m8
      case 0o206: {
        const [registerNumber, segment, offset] = this.decodeModRM();
        const registerValue = this.getRegisterByte(registerNumber);
        const memoryValue = this.readByte(segment, offset);
        this.setRegisterByte(registerNumber, memoryValue);
        this.writeByte(segment, offset, registerValue);
        break;
      }
      // XCHG r16, r/m16
      case 0o207: {
        const [registerNumber, segment, offset] = this.decodeModRM();
        const registerValue = this.getRegisterWord(registerNumber);
        const memoryValue = this.readWord(segment, offset);
        this.setRegisterWord(registerNumber, memoryValue);
        this.writeWord(segment, offset, registerValue);
        break;
      }
      // MOV r/m8, r8
      case 0o210: {
        const [registerNumber, segment, offset] = this.decodeModRM();
        this.writeByte(segment, offset, this.getRegisterByte(registerNumber));
        break;
      }
      // MOV r/m16, r16
      case 0o211: {
        const [registerNumber, segment, offset] = this.decodeModRM();
        this.writeWord(segment, offset, this.getRegisterWord(registerNumber));
        break;
      }
      // MOV r8, r/m8
      case 0o212: {
        const [registerNumber, segment, offset] = this.decodeModRM();
        this.setRegisterByte(registerNumber, this.readByte(segment, offset));
        break;
      }
      // MOV r16, r/m16
      case 0o213: {
        const [registerNumber, segment, offset] = this.decodeModRM();
        this.setRegisterWord(registerNumber, this.readWord(segment, offset));
        break;
      }
      // MOV r/m16, seg
      case 0o214: {
        const [registerNumber, segment, offset] = this.decodeModRM();
        this.writeWord(segment, offset, this.getSegment(registerNumber));
        break;
      }
      // LEA r/16, r/m16
      case 0o215: {
        const [registerNumber, segment, offset] = this.decodeModRM();
        const result = segment === REGISTER ? this.getRegisterWord(offset) : linearAddress(segment, offset);
        this.setRegisterWord(registerNumber, result);
        break;
      }
      // MOV seg, r/m16
      case 0o216: {
        const [registerNumber, segment, offset] = this.decodeModRM();
        this.setSegment(registerNumber, this.readWord(segment, offset));
        break;
      }
      // POP r/m16
      case 0o217: {
        const [_, segment, offset] = this.decodeModRM();
        this.writeWord(segment, offset, this.popWord());
        break;
      }
      // XCHG AX, r16
      case 0o221:
      case 0o222:
      case 0o223:
      case 0o224:
      case 0o225:
      case 0o226:
      case 0o227: {
        const value = this.getRegisterWord(ir);
        this.setRegisterWord(ir, this.ax);
        this.ax = value;
        break;
      }
      // PUSHF
      case 0o234:
        this.pushWord(0);
        break;
      // POPF
      case 0o235:
        this.popWord();
        break;
      // SAHF/LAHF
      case 0o236:
      case 0o237:
        break;
      // MOV AL, [addr]
      case 0o240: {
        const offset = this.fetchWord();
        this.setRegisterByte(AX, this.readByte(this.ds, offset));
        break;
      }
      // MOV AX, [addr]
      case 0o241: {
        const offset = this.fetchWord();
        this.setRegisterWord(AX, this.readWord(this.ds, offset));
        break;
      }
      // MOV [addr], AL
      case 0o242: {
        const offset = this.fetchWord();
        this.writeByte(this.ds, offset, this.getRegisterByte(AX));
        break;
      }
      // MOV [addr], AX
      case 0o243: {
        const offset = this.fetchWord();
        this.writeWord(this.ds, offset, this.getRegisterWord(AX));
        break;
      }
      // MOV r8, d8
      case 0o260:
      case 0o261:
      case 0o262:
      case 0o263:
      case 0o264:
      case 0o265:
      case 0o266:
      case 0o267:
        this.setRegisterByte(ir, this.fetchByte());
        break;
      // MOV r16, d16
      case 0o270:
      case 0o271:
      case 0o272:
      case 0o273:
      case 0o274:
      case 0o275:
      case 0o276:
      case 0o277:
        this.setRegisterWord(ir, this.fetchWord());
        break;
      // RETF d16
      case 0o312: {
        const discard = this.fetchWord();
        this.ip = this.popWord();
        this.cs = this.popWord();
        this.sp += discard;
        break;
      }
      // RETF
      case 0o313:
        this.ip = this.popWord();
        this.cs = this.popWord();
        break;
      // INT d8
      case 0o315: {
        const arg = this.fetchByte();
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

  private fetchByte(): number {
    return this.readByte(this.cs, this.ip++)
  }

  private fetchSignedByte(): number {
    return this.readSignedByte(this.cs, this.ip++)
  }

  private fetchWord(): number {
    const word = this.readWord(this.cs, this.ip);
    this.ip += 2;
    return word;
  }

  private getRegisterByte(reg: number): number {
    const word = this.registers[reg & 3];
    return reg < 4 ? word & 0xff : (word >> 8) & 0xff;
  }

  private setRegisterByte(reg: number, byte: number) {
    const word = this.registers[reg & 3];
    this.registers[reg & 3] = (
      reg < 4 ?
      (word & 0xff00) | (byte & 0xff) :
      ((byte << 8) & 0xff00) | (word & 0xff)
    );
  }

  private getRegisterWord(reg: number): number {
    return this.registers[reg & 7];
  }

  private setRegisterWord(reg: number, word: number) {
    this.registers[reg & 7] = word;
  }

  private getSegment(seg: number): number {
    return this.segments[seg & 3];
  }

  private setSegment(seg: number, word: number) {
    this.segments[seg] = word;
  }

  private decodeModRM(): [registerNumber: number, segment: number, offset: number] {
    const modRM = this.fetchByte();
    return [(modRM >> 3) & 7, ...this.computeEffectiveAddress(modRM)];
  }

  private computeEffectiveAddress(modRM: number): [segment: number, offset: number] {
    switch (modRM & 0o307) {
      case 0o000:
        return [this.ds, this.bx + this.si];
      case 0o001:
        return [this.ds, this.bx + this.di];
      case 0o002:
        return [this.ss, this.bx + this.si];
      case 0o003:
        return [this.ss, this.bx + this.di];
      case 0o004:
        return [this.ds, this.si];
      case 0o005:
        return [this.ds, this.di];
      case 0o006:
        return [this.ds, this.fetchWord()];
      case 0o007:
        return [this.ds, this.bx];
      case 0o100:
        return [this.ds, this.bx + this.si + this.fetchSignedByte()];
      case 0o101:
        return [this.ds, this.bx + this.di + this.fetchSignedByte()];
      case 0o102:
        return [this.ss, this.bx + this.si + this.fetchSignedByte()];
      case 0o103:
        return [this.ss, this.bx + this.di + this.fetchSignedByte()];
      case 0o104:
        return [this.ds, this.si + this.fetchSignedByte()];
      case 0o105:
        return [this.ds, this.di + this.fetchSignedByte()];
      case 0o106:
        return [this.ss, this.bp + this.fetchSignedByte()];
      case 0o107:
        return [this.ds, this.bx + this.fetchSignedByte()];
      case 0o200:
        return [this.ds, this.bx + this.si + this.fetchWord()];
      case 0o201:
        return [this.ds, this.bx + this.di + this.fetchWord()];
      case 0o202:
        return [this.ss, this.bx + this.si + this.fetchWord()];
      case 0o203:
        return [this.ss, this.bx + this.di + this.fetchWord()];
      case 0o204:
        return [this.ds, this.si + this.fetchWord()];
      case 0o205:
        return [this.ds, this.di + this.fetchWord()];
      case 0o206:
        return [this.ss, this.bp + this.fetchWord()];
      case 0o207:
        return [this.ds, this.bx + this.fetchWord()];
      default:
        return [REGISTER, modRM & 7];
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
    if (segment === REGISTER) {
      return this.getRegisterWord(offset);
    }
    const b0 = this.readByte(segment, offset);
    const b1 = this.readByte(segment, offset + 1);
    return b0 + (b1 << 8);
  }

  writeWord(segment: number, offset: number, value: number) {
    if (segment === REGISTER) {
      return this.setRegisterWord(offset, value);
    }
    this.writeByte(segment, offset, value & 0xff);
    this.writeByte(segment, offset + 1, (value >> 8) & 0xff);
  }

  readSignedByte(segment: number, offset: number): number {
    if (segment === REGISTER) {
      return this.getRegisterByte(offset);
    }
    const data = this.readByte(segment, offset);
    return data < 128 ? data : data - 256;
  }

  readByte(segment: number, offset: number): number {
    if (segment === REGISTER) {
      return this.getRegisterByte(offset);
    }
    const address = linearAddress(segment, offset) & 0xffff;
    if (address > this.memory.length) {
      throw new Error('Read out of bounds');
    }
    return this.memory[address];
  }

  writeByte(segment: number, offset: number, value: number) {
    if (segment === REGISTER) {
      return this.setRegisterByte(offset, value);
    }
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

// Simulates an int 33h mouse driver.
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

// Really hacky int 21h DOS services to assist with loading midi files.
class DosHandler implements InterruptHandler {
  constructor(private context: ExecutionContext) {
  }

  call(cpu: Basic86) {
    const ah = cpu.ax >> 8;
    const al = cpu.ax & 0xff;
    switch (ah) {
      case 0x35:
        // Get interrupt vector.  Used to detect SBMIDI / SBSIM.
        switch (al) {
          case 0x80:
            cpu.es = SBMIDI_SEGMENT;
            cpu.bx = 0;
            break;
          case 0x81:
            cpu.es = SBSIM_SEGMENT;
            cpu.bx = 0;
            break;
          default:
            cpu.es = 0;
            cpu.bx = 0;
            break;
        }
        break;
      case 0x3d:
        // Open file.  Assume this is going to precede a file read and just
        // return a handle with the path string's segment from ds.
        cpu.ax = cpu.ds;
        break;
      case 0x3e:
        // Close file.  Ignored.
        break;
      case 0x3f: {
        // Read from file.  Assume that the "handle" in bx is a pointer to a
        // null-terminated path name, and that we want to write to the beginning
        // of the output variable in ds.
        const {variable: nameVariable} = this.context.memory.readPointer(cpu.bx);
        const {variable: dataVariable} = this.context.memory.readPointer(cpu.ds);
        const nameBuffer = readVariableToBytes(nameVariable, this.context.memory);
        const name = asciiToString(Array.from(new Uint8Array(nameBuffer.slice(0, nameBuffer.byteLength - 1))));
        const data = readEntireFile(this.context, name);
        writeBytesToVariable(dataVariable, new Uint8Array(data), this.context.memory);
        break;
      }
      default:
        throw new Error(`Unsupported DOS call ${ah}`);
    }
  }
}

// Simulates the SBMIDI and SBSIM 80h and 81h driver APIs.
// It is hard to find official documentation about these APIs, so this is
// modeled on what QMIDI.BAS seems to expect.
class MidiHandler implements InterruptHandler {
  constructor(private context: ExecutionContext) {
  }

  call(cpu: Basic86) {
    const {speaker} = this.context.devices;
    switch (cpu.bx) {
      case 0x4: {
        // SBMIDI: Load a midi file... also used to stop playing whatever is playing.
        speaker.stopMidi();
        if (cpu.dx !== 0) {
          // If DX is set, then DX:AX points to the data to load.
          const {variable} = this.context.memory.readPointer(cpu.dx);
          const data = readVariableToBytes(variable, this.context.memory);
          speaker.loadMidi(data);
        }
        break;
      }
      case 0x5:
      case 0x501:
        // SBMIDI: Play midi
        speaker.playMidi({restart: true});
        break;
      case 0x8:
        // SBMIDI: Resume playing
        speaker.playMidi({restart: false});
        break;
      case 0x11:
        // SBMIDI: Check play state
        cpu.ax = speaker.playingMidi() ? 1 : 0;
        break;
      case 0x500: {
        // SBMIDI: Load a midi file from path given by dx:ax.
        const {variable: nameVariable} = this.context.memory.readPointer(cpu.dx);
        const nameBuffer = readVariableToBytes(nameVariable, this.context.memory);
        const name = asciiToString(Array.from(new Uint8Array(nameBuffer.slice(0, nameBuffer.byteLength - 1))));
        const data = readEntireFile(this.context, name);
        speaker.loadMidi(new Uint8Array(data).buffer);
        break;
      }
      case 0x502:
        // SBMIDI: Stop midi.
        speaker.stopMidi();
        break;
      case 0x503:
        // SBSIM: Pause midi without reloading the file
        speaker.stopMidi();
        break;
      case 0x504:
        // SBSIM: Resume midi playback
        speaker.playMidi({restart: false});
        break;
      default:
        throw new Error(`Unsupported SBMIDI call ${cpu.bx}`);
    }
  }
}

interface Patch {
  program: number[];
  rewrite: number[];
}

// Hacky fixes for commonly used snippets of machine language.
const PATCHES: Patch[] = [
  // This widely copied QMIDI.BAS < 4.0 "load midi" subroutine uses a clobbered
  // DS after an int 21h call to open a file. This is probably? usually? safe
  // for qbasic, but breaks our DS assignment.
  {
    program: [
      0x1e,              // PUSH DS
      0x55,              // PUSH BP
      0x89, 0xe5,        // MOV  BP, SP
      0xb8, 0x0, 0x3d,   // MOV  AX, 3d00     ; AH=3d open file
      0x8b, 0x5e, 0xe,   // MOV  BX, [BP+e]
      0x8b, 0x17,        // MOV  DX, [BX]     ; DX=path$ offset
      0x8b, 0x5e, 0x10,  // MOV  BX, [BP+10]
      0x8e, 0x1f,        // MOV  DS, [BX]     ; DS=path$ segment <-- Reassigns DS.
      0xcd, 0x21,        // INT  21           ; Call dos
      0x89, 0xc6,        // MOV  SI, AX       ; Save file handle
      0xb4, 0x3f,        // MOV  AH, 3F       ; AH=3f read file
      0x8b, 0x5e, 0x8,   // MOV  BX, [BP+8]
      0x8b, 0xf,         // MOV  CX, [BX]     ; CX=length        <-- Assumes original DS.
      0x8b, 0x5e, 0xa,   // MOV  BX, [BP+a]
      0x8b, 0x17,        // MOV  DX, BX       ; DX=read buffer offset
      0x8b, 0x5e, 0xc,   // MOV  BX, [BP+c]
      0x8e, 0x1f,        // MOV  DS, [BX]     ; DS=read buffer segment
      0x89, 0xf3,        // MOV  BX, SI       ; BX=handle
      0xcd, 0x21,        // INT  21           ; Call dos
      0xb4, 0x3e,        // MOV  AH, 3e       ; AH=3e close file
      0xcd, 0x21,        // INT  21           ; Call dos
      0x5d,              // POP  BP
      0x1f,              // POP  DS
      0xca, 0xa, 0x0,    // RETF a
    ],
    rewrite: [
      0x1e,              // PUSH DS
      0x55,              // PUSH BP
      0x89, 0xe5,        // MOV  BP, SP
      0xb8, 0x0, 0x3d,   // MOV  AX, 3d00     ; AH=3d open file
      0x8b, 0x5e, 0xe,   // MOV  BX, [BP+e]
      0x8b, 0x17,        // MOV  DX, [BX]     ; DX=path$ offset
      0x8b, 0x5e, 0x10,  // MOV  BX, [BP+10]
      0x8e, 0x1f,        // MOV  DS, [BX]     ; DS=path$ segment
      0xcd, 0x21,        // INT  21           ; Call dos
      // Begin patch
      0x8b, 0x5e, 0x2,   // MOV  BX, [BP+2]   ; Get saved DS from stack
      0x8e, 0xdb,        // MOV  DS, BX       ; Restore saved DS
      // End patch
      0x89, 0xc6,        // MOV  SI, AX       ; Save file handle
      0xb4, 0x3f,        // MOV  AH, 3F       ; AH=3f read file
      0x8b, 0x5e, 0x8,   // MOV  BX, [BP+8]
      0x8b, 0xf,         // MOV  CX, [BX]     ; CX=length
      0x8b, 0x5e, 0xa,   // MOV  BX, [BP+a]
      0x8b, 0x17,        // MOV  DX, BX       ; DX=read buffer offset
      0x8b, 0x5e, 0xc,   // MOV  BX, [BP+c]
      0x8e, 0x1f,        // MOV  DS, [BX]     ; DS=read buffer segment
      0x89, 0xf3,        // MOV  BX, SI       ; BX=handle
      0xcd, 0x21,        // INT  21           ; Call dos
      0xb4, 0x3e,        // MOV  AH, 3e       ; AH=3e close file
      0xcd, 0x21,        // INT  21           ; Call dos
      0x5d,              // POP  BP
      0x1f,              // POP  DS
      0xca, 0xa, 0x0,    // RETF a
    ],
  },
];

function patch(code: Uint8Array): Uint8Array {
  for (const {program, rewrite} of PATCHES) {
    if (code.byteLength === program.length) {
      if (program.every((value, i) => value === code[i])) {
        return new Uint8Array(rewrite);
      }
    }
  }
  return code;
}