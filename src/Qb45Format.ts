import { stringToAscii } from "./AsciiChart";

export function decodeQb45BinaryFile(buffer: ArrayBuffer): number[] {
  return new Qb45Loader(buffer).decode();
}

// Offset of the first byte of symbol data (preceded by a 2-byte length).
const SYMBOL_TABLE_START = 28;

// A list of CP-437 ASCII character codes.
type Ascii = number[];

// An entry on the p-code parse stack.
interface Entry {
  pcode?: number;  // Token that pushed this entry.
  text: Ascii;  // Text associated.
}

// Loosely based on the QB45BIN.bas utility from the QB64 project, and a lot of
// random experimentation.
class Qb45Loader {
  data: DataView;
  offset: number = 0;
  output: number[] = [];
  stack: Entry[] = [];
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
      const {pcode, text} = this.parseToken();
      if (this.endOfLine) {
        for (let i = 0; i < this.stack.length; i++) {
          this.output.push(...this.stack[i].text);
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
      if (text !== undefined) {
        // Some tokens are skipped or manipulate the current top of stack.
        // Otherwise, if there is text, assume that we need to push it.
        this.push({pcode, text});
      }
    }
    return this.output;
  }

  private push(entry: Entry) {
    this.stack.push(entry);
  }

  private pop(): Entry {
    const top = this.stack.pop();
    if (top === undefined) {
      throw new Error(`stack overflow`);
    }
    return top;
  }

  private parseToken(): {pcode?: number, text?: Ascii} {
    const rawToken = this.u16();
    const pcode = rawToken & 0x03ff;
    const param = (rawToken >> 10) & 0x3f;
    const S = stringToAscii;
    const T = (template: string): Entry => {
      const fields = template.match(/{[^}]+}|./g);
      const maxStackArgument = Math.max(
        ...(template.match(/{([0-9])}/g) ?? []).map((n: string) => +n[1])
      );
      const stackArguments: Ascii[] = [];
      if (maxStackArgument >= 0) {
        for (let i = 0; i < maxStackArgument + 1; i++) {
          stackArguments.push(this.pop().text);
        }
      }
      let parts: Ascii[] = [];
      for (const field of fields ?? []) {
        switch (field) {
          case '{id}':
            parts.push(this.id(this.u16()));
            break;
          case '{id+}':
            parts.push(this.id(this.u16()));
            parts.push(S(getSigil(param)));
            break;
          case '{0}':
            parts.push(stackArguments[0]);
            break;
          case '{1}':
            parts.push(stackArguments[1]);
            break;
          case '{2}':
            parts.push(stackArguments[2]);
            break;
          case '{3}':
            parts.push(stackArguments[3]);
            break;
          case '{4}':
            parts.push(stackArguments[4]);
            break;
          case '{5}':
            parts.push(stackArguments[5]);
            break;
          default:
            parts.push(S(field));
        }
      }
      return {pcode, text: parts.flat()};
    };
    switch (pcode) {
      case 0x000:
        this.endOfLine = true;
        return {};
      case 0x006:
        return T(': ');
      case 0x008:
        this.endOfLine = true;
        this.endOfProgram = true;
        return {};
      case 0x009:
        return {};  // end of watches, skip
      case 0x00b:
        return T('{id+}');
      case 0x00c: {
        const value = this.pop();
        const id = this.idWithSigil(this.u16(), param);
        const assignment = [...id, ...S(' = '), ...value.text];
        const top = this.stack.at(-1);
        if (top && top.pcode === 0x023) {
          const delim = top.text.at(-1) === 0x20 ? [] : S(', ');
          top.text = [...top.text, ...delim, ...assignment];
          return {};
        }
        return {text: assignment};
      }
      case 0x023:
        return T('const ');
      case 0x025:
        return T('byval {0}');
      case 0x026: // TODO
        return {};
      case 0x027:
        return T('com({0})');
      case 0x028:
        return T('on {0} gosub {id}');
      case 0x029:
        return T('key({0})');
      case 0x02a:
        return T('{0} off');
      case 0x0a6: {
        const length = this.u16();
        return {text: [...S('data'), ...this.string(length, true)]};
      }
      case 0x0e3: {
        const length = this.u16();
        return {text: [...S('rem'), ...this.string(length)]};
      }
      case 0x100:
        return T('{1} + {0}');
      case 0x15b:
        return T('varptr({0})');
      case 0x15c: {
        const skip = this.u16();
        return T('varptr$({0})');
      }
      case 0x15d:
        return T('varseg({0})');
      case 0x15e:
        return T('{1} >= {0}');
      case 0x15f:
        return T('{1} > {0}');
      case 0x160:
        return T('{1} \\ {0}');
      case 0x161:
        return T('{1} imp {0}');
      case 0x162:
        return T('{1} <= {0}');
      case 0x163:
        return T('{1} < {0}');
      case 0x164:
        return T(`${param}`);
      case 0x165:
        return T(`${this.i16()}`);
      case 0x166:
        return T(`${this.i32()}`);
      case 0x167:
        return T(`&H${this.u16().toString(16)}`);
      case 0x168:
        return T(`&H${this.u32().toString(16)}`);
      case 0x169:
        return T(`&O${this.u16().toString(8)}`);
      case 0x16a:
        return T(`&O${this.u32().toString(8)}`);
      case 0x16b:
        return T(`${this.f32()}`);
      case 0x16c:
        return T(`${this.f64()}`);
      case 0x16d: {
        const length = this.u16();
        const quotedString = this.string(length + 1);
        if (quotedString.at(-1) !== 0x22) {
          throw new Error('expecting string to have final "');
        }
        return {text: [...S('"'), ...quotedString]};
      }
      case 0x16e:
        return T('({0})');
      case 0x16f:
        return T('{1} mod {0}');
      case 0x170:
        return T('{1} * {0}');
      case 0x172:
        return {};
      case 0x173:
        return {};
      case 0x174:
        return T('not {0}')
      case 0x175:
        return T('{1} or {0}');
      case 0x176:
        return T('{1} ^ {0}');
      case 0x177:
        return T('{1} - {0}');
      case 0x178:
        return T('-{0}');
      case 0x179:
        return T('{1} xor {0}');
      case 0x17a:
        return T('uevent');
      case 0x17b:
        return T('sleep {0}');
    }
    throw new Error(`unrecognized token: ${pcode}`);
  }

  private idWithSigil(offset: number, param: number): Ascii {
    return [...this.id(offset), ...stringToAscii(getSigil(param))];
  }

  private id(offset: number): Ascii {
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

  private string(length: number, nullTerminated = false): Ascii {
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

function getSigil(param: number): string {
  switch (param) {
    case 1:
      return '%';
    case 2:
      return '&';
    case 3:
      return '!';
    case 4:
      return '#';
    case 5:
      return '$';
  }
  return '';
}