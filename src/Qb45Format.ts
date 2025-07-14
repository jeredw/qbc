import { stringToAscii } from "./AsciiChart";

export function decodeQb45BinaryFile(buffer: ArrayBuffer): number[] {
  return new Qb45Loader(buffer).decode();
}

// Offset of the first byte of symbol data (preceded by a 2-byte length).
const SYMBOL_TABLE_START = 28;

// Loosely based on the QB45BIN.bas utility from the QB64 project, and a lot of
// random experimentation.
class Qb45Loader {
  data: DataView;
  offset: number = 0;
  output: number[] = [];
  stack: number[][] = [];
  endOfProgram = false;
  endOfLine = false;

  constructor(buffer: ArrayBuffer) {
    this.data = new DataView(buffer);
  }

  decode(): number[] {
    const magic = this.u16();
    const version = this.u16();
    if (magic != 0xfc || version != 1) {
      throw new Error('not a qb45 binary file');
    }
    // Skip over the symbol table
    this.offset = SYMBOL_TABLE_START - 2;
    const symbolTableSize = this.u16();
    this.offset += symbolTableSize;
    const mainModuleSize = this.u16();
    let firstLine = true;
    while (this.offset < this.data.byteLength) {
      const output = this.parseToken();
      if (this.endOfLine) {
        if (this.stack.length > 1) {
          throw new Error('too many items on stack at end of line');
        }
        if (this.stack.length === 1) {
          this.output.push(...this.stack[0]);
        }
        if (this.endOfProgram) {
          break;
        }
        if (!firstLine) {
          this.output.push(...stringToAscii('\n'));
        }
        firstLine = false;
        this.stack = [];
        this.endOfLine = false;
        continue;
      }
      if (output !== undefined) {
        this.push(output);
      }
    }
    return this.output;
  }

  private push(output: number[]) {
    this.stack.push(output);
  }

  private pop(): number[] {
    const top = this.stack.pop();
    if (top === undefined) {
      throw new Error(`stack overflow`);
    }
    return top;
  }

  private parseToken(): number[] | void {
    const rawToken = this.u16();
    const pcode = rawToken & 0x03ff;
    const param = (rawToken >> 10) & 0x3f;
    const S = stringToAscii;
    const binaryOperator = (op: string): number[] => {
      const b = this.pop();
      const a = this.pop();
      return [...a, ...S(` ${op} `), ...b];
    };
    const call = (fn: string, numArgs: number): number[] => {
      let argumentList: number[] = [];
      for (let i = 0; i < numArgs; i++) {
        const argument = this.pop();
        if (i > 0) {
          argumentList = [...argument, ...S(', '), ...argumentList];
        } else {
          argumentList = argument;
        }
      }
      return [...S(`${fn}(`), ...argumentList, ...S(')')];
    };
    switch (pcode) {
      case 0x000:
        this.endOfLine = true;
        return [];
      case 0x008:
        this.endOfLine = true;
        this.endOfProgram = true;
        return [];
      case 0x009:
        return;  // end of watches, skip
      case 0x00b:
        return this.id(this.u16());
      case 0x00c: {
        const value = this.pop();
        const id = this.id(this.u16());
        return [...id, ...S(' = '), ...value];
      }
      case 0x0a6: {
        const length = this.u16();
        return [...S(`data`), ...this.string(length, true)];
      }
      case 0x0e3: {
        const length = this.u16();
        return [...S(`rem`), ...this.string(length)];
      }
      case 0x15b:
        return call('varptr', 1);
      case 0x15c: {
        const skip = this.u16();
        return call('varptr$', 1);
      }
      case 0x15d:
        return call('varseg', 1);
      case 0x15e:
        return binaryOperator('>=');
      case 0x15f:
        return binaryOperator('>');
      case 0x160:
        return binaryOperator('\\');
      case 0x161:
        return binaryOperator('imp');
      case 0x162:
        return binaryOperator('<=');
      case 0x163:
        return binaryOperator('<');
      case 0x164:
        return S(`${param}`);
      case 0x165:
        return S(`${this.i16()}`);
      case 0x166:
        return S(`${this.i32()}`);
      case 0x167:
        return S(`&H${this.u16().toString(16)}`);
      case 0x168:
        return S(`&H${this.u32().toString(16)}`);
      case 0x169:
        return S(`&O${this.u16().toString(8)}`);
      case 0x16a:
        return S(`&O${this.u32().toString(8)}`);
      case 0x16b:
        return S(`${this.f32()}`);
      case 0x16c:
        return S(`${this.f64()}`);
      case 0x16d: {
        const length = this.u16();
        const quotedString = this.string(length + 1);
        if (quotedString.at(-1) !== 0x22) {
          throw new Error('expecting string to have final "');
        }
        return [...S('"'), ...quotedString];
      }
      case 0x16e:
        return [...S('('), ...this.pop(), ...S(')')];
      case 0x16f:
        return binaryOperator('mod');
      case 0x170:
        return binaryOperator('*');
      case 0x172:
        return [];
      case 0x173:
        return [];
      case 0x174:
        return [...S('not '), ...this.pop()];
      case 0x175:
        return binaryOperator('or');
      case 0x176:
        return binaryOperator('^');
      case 0x177:
        return binaryOperator('-');
      case 0x178:
        return [...S('-'), ...this.pop()];
      case 0x179:
        return binaryOperator('xor');
      case 0x17a:
        return S('uevent');
      case 0x17b:
        return [...S('sleep'), ...this.pop()];
    }
    throw new Error(`unrecognized token: ${pcode}`);
  }

  private id(offset: number): number[] {
    if (offset === 0xffff) {
      // Used for 0 in ON ERROR GOTO 0.
      return stringToAscii('0');
    }
    const littleEndian = true;
    const symbolOffset = SYMBOL_TABLE_START + offset;
    const flags = this.data.getUint8(symbolOffset + 2);
    if (flags & 2) {
      // Short line number stored as integer.
      const value = this.data.getUint16(symbolOffset + 4, littleEndian);
      return stringToAscii(`${value}`);
    }
    // A length prefixed string at symbolOffset + 3.
    const savedOffset = this.offset;
    this.offset = symbolOffset + 3;
    const length = this.u8();
    const result = this.string(length);
    this.offset = savedOffset;
    return result;
  }

  private string(length: number, nullTerminated = false): number[] {
    // Always read and output length bytes, but if nullTerminated is true, truncate the
    // string at the first \x00 byte.
    const string: number[] = [];
    let sawNull = false;
    for (let i = 0; i < length; i++) {
      const byte = this.data.getUint8(this.offset++);
      if (byte === 0) {
        sawNull = true;
      }
      if (!sawNull || !nullTerminated) {
        string.push(byte);
      }
    }
    return string;
  }

  private u8(): number {
    const value = this.data.getUint8(this.offset);
    this.offset++;
    return value;
  }

  private i16(): number {
    const littleEndian = true;
    const value = this.data.getInt16(this.offset, littleEndian);
    this.offset += 2;
    return value;
  }

  private u16(): number {
    const littleEndian = true;
    const value = this.data.getUint16(this.offset, littleEndian);
    this.offset += 2;
    return value;
  }

  private i32(): number {
    const littleEndian = true;
    const value = this.data.getInt32(this.offset, littleEndian);
    this.offset += 4;
    return value;
  }

  private u32(): number {
    const littleEndian = true;
    const value = this.data.getUint32(this.offset, littleEndian);
    this.offset += 4;
    return value;
  }

  private f32(): number {
    const littleEndian = true;
    const value = this.data.getFloat32(this.offset, littleEndian);
    this.offset += 4;
    return value;
  }

  private f64(): number {
    const littleEndian = true;
    const value = this.data.getFloat64(this.offset, littleEndian);
    this.offset += 8;
    return value;
  }
}