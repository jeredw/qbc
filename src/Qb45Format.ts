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
        ...(template.match(/{([0-9]+)}/g) ?? []).map((n: string) => +n[1])
      );
      const stackArguments: Ascii[] = [];
      if (maxStackArgument >= 0) {
        for (let i = 0; i < maxStackArgument + 1; i++) {
          stackArguments.push(this.pop().text);
        }
      }
      let parts: Ascii[] = [];
      for (const field of fields ?? []) {
        if (/{[0-9]+}/.test(field)) {
          const argumentIndex = +field.slice(1, -1);
          parts.push(stackArguments[argumentIndex]);
          continue;
        }
        switch (field) {
          case '{id}':
            parts.push(this.id(this.u16()));
            break;
          case '{id+}':
            parts.push(this.id(this.u16()));
            parts.push(S(getSigil(param)));
            break;
          default:
            parts.push(S(field));
        }
      }
      return {pcode, text: parts.flat()};
    };
    const circle = (): Entry => {
      const params: string[] = ['', '', '', '', '', ''];
      let argumentIndex = 0;
      // 7e -> argument 6 is present
      // 7f -> argument 5 is present
      // 80 -> argument 4 is present
      for (let i = 0; i < 3; i++) {
        if (this.stack.at(-1 - argumentIndex)?.pcode === 0x07e + i) {
          params[5 - i] = `{${argumentIndex++}}`;
        }
      }
      if (pcode !== 0x09f) {
        // Color argument is present.
        params[2] = `{${argumentIndex++}}`;
      }
      params[1] = `{${argumentIndex++}}`;
      params[0] = `{${argumentIndex++}}`;
      let lastValidArgument = 0;
      for (lastValidArgument = params.length - 1; lastValidArgument >= 0; lastValidArgument--) {
        if (params[lastValidArgument] !== '') {
          break;
        }
      }
      params.length = lastValidArgument + 1;
      return T(`CIRCLE ${params.join(', ')}`);
    };
    const defType = (): Entry => {
      this.skipU16();
      const mask = this.u32();
      // Groups of letters A-Z are specified by bits 31, 30, etc. of mask.
      const ranges: number[][] = [];
      let start = -1;
      let end = -1;
      for (let i = 0; i < 26; i++) {
        const included = mask & (1 << (31 - i));
        if (included) {
          if (start === -1) {
            start = end = i;
          } else {
            end = i;
          }
        }
        if ((!included || i === 25) && start !== -1) {
          ranges.push([start, end]);
          start = -1;
        }
      }
      const L = (i: number) => String.fromCharCode('A'.charCodeAt(0) + i);
      const rangeSpec = ranges.map(([s, e]) => s === e ? L(s) : `${L(s)}-${L(e)}`).join(', ');
      const type = getDefTypeName(mask & 7);
      return T(`DEF${type} ${rangeSpec}`);
    };
    switch (pcode) {
      case 0x000:
        this.endOfLine = true;
        return T(' '.repeat(param));
      case 0x001:
        this.endOfLine = true;
        return T(' '.repeat(this.u16()));
      case 0x002:
        this.skipU16();
        this.endOfLine = true;
        return {};
      case 0x003:
        this.skipU16();
        this.endOfLine = true;
        return T(' '.repeat(this.u16()));
      case 0x004: {
        this.endOfLine = true;
        this.skipU16();
        const label = this.id(this.u16());
        const separator = label[0] >= '0'.charCodeAt(0) && label[0] <= '9'.charCodeAt(0) ? ' ' : ': ';
        return {pcode, text: [...label, ...S(separator)]};
      }
      case 0x005: {
        this.endOfLine = true;
        this.skipU16();
        const label = this.id(this.u16());
        const indent = ' '.repeat(this.u16());
        const separator = label[0] >= '0'.charCodeAt(0) && label[0] <= '9'.charCodeAt(0) ? '' : ':';
        return {pcode, text: [...label, ...S(separator), ...S(indent)]};
      }
      case 0x006:
        return T(': ');
      case 0x007:
        return T(' '.repeat(this.u16()));
      case 0x008:
        this.endOfLine = true;
        this.endOfProgram = true;
        return {};
      case 0x009:
        return {};  // end of watches, skip
      case 0x00a: {
        const length = this.u16();
        // This token occurs for random unrecognized text in a program.
        // In that case the first two bytes of string data seem to be \xff and should be skipped.
        return {pcode, text: this.string(length).slice(2)};
      }
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
      case 0x019: {
        this.skipU16();
        return T('{id}');
      }
      case 0x01a:
        return T('SHARED');
      case 0x01b:
        return defType();
      case 0x01c: {
        if (this.stack.at(-2)?.pcode === 0x01a) {
          return T('REDIM {1} {0}');
        }
        return T('REDIM {0}');
      }
      case 0x01d: {
        this.skipU16();
        return T('END TYPE');
      }
      case 0x01e: {
        this.skipU16();
        return T('SHARED ');
      }
      case 0x01f: {
        this.skipU16();
        return T('STATIC ');
      }
      case 0x020: {
        this.skipU16();
        return T('TYPE {id}');
      }
      case 0x023:
        return T('CONST ');
      case 0x024:
        return {};
      case 0x025:
        return T('BYVAL {0}');
      case 0x026: // TODO
        return {};
      case 0x027:
        return T('COM({0})');
      case 0x028:
        return T('ON {0} GOSUB {id}');
      case 0x029:
        return T('KEY({0})');
      case 0x02a:
        return T('{0} OFF');
      case 0x02b:
        return T('{0} ON');
      case 0x02c:
        return T('{0} STOP');
      case 0x02d:
        return T('PEN');
      case 0x02e:
        return T('PLAY');
      case 0x02f:
        return T('PLAY({0})');
      case 0x030:
        return T('SIGNAL({0})');
      case 0x031:
        return T('STRIG({0})');
      case 0x032:
        return T('TIMER');
      case 0x033:
        return T('TIMER({0})');
      case 0x05b:
        return T('GOTO {id}');
      case 0x07b:
      case 0x07c:
        return {};
      // Dummy tokens for variable arguments in circle statement.
      case 0x07e:
      case 0x07f:
      case 0x080:
        return T('{0}');
      case 0x081:
        return T('({1}, {0})');
      case 0x082:
        return T('STEP({1}, {0})');
      case 0x083:
        return T('-({1}, {0})');
      case 0x084:
        return T('-STEP({1}, {0})');
      case 0x08a:
        return T('#{0}');
      case 0x09a:
        return T('BEEP');
      case 0x09b:
        return T('BLOAD {0}');
      case 0x09c:
        return T('BLOAD {1}, {0}');
      case 0x09d:
        return T('BSAVE {2}, {1}, {0}');
      case 0x09e:
        return T('CHDIR {0}');
      case 0x09f:
      case 0x0a0:
        return circle();
      case 0x0a1:
        this.skipU16();
        return T('CLEAR ');
      case 0x0a2:
        this.skipU16();
        return T('CLEAR ');
      case 0x0a3:
        return T('CLS ');
      case 0x0a4: {
        this.skipU16();
        return T('COLOR ');
      }
      case 0x0a6:
        this.skipU16();
        return {text: [...S('DATA'), ...this.string(length, true)]};
      case 0x0e3: {
        const length = this.u16();
        return {text: [...S('REM'), ...this.string(length)]};
      }
      case 0x100:
        return T('{1} + {0}');
      case 0x101:
        return T('{1} AND {0}');
      case 0x102:
        return T('{1} / {0}');
      case 0x103:
        return T('{1} = {0}');
      case 0x104:
        return T('{1} EQV {0}');
      case 0x105:
        return T('ABS({0})');
      case 0x106:
        return T('ASC({0})');
      case 0x107:
        return T('ATN({0})');
      case 0x108: {
        switch (param) {
          case 1:
            return T('CINT({0})');
          case 2:
            return T('CLNG({0})');
          case 3:
            return T('CSNG({0})');
          case 4:
            return T('CDBL({0})');
        }
        break;
      }
      case 0x109:
        return T('CHR$({0})');
      case 0x10a:
        return T('COMMAND$');
      case 0x10b:
        return T('COS({0})');
      case 0x10c:
        return T('CSRLIN');
      case 0x10d:
        return T('CVD({0})');
      case 0x10e:
        return T('CVDMBD({0})');
      case 0x10f:
        return T('CVI({0})');
      case 0x110:
        return T('CVL({0})');
      case 0x111:
        return T('CVS({0})');
      case 0x112:
        return T('CVSMBF({0})');
      case 0x113:
        return T('DATE$');
      case 0x114:
        return T('ENVIRON$({0})');
      case 0x115:
        return T('EOF({0})');
      case 0x116:
        return T('ERDEV');
      case 0x117:
        return T('ERDEV$');
      case 0x118:
        return T('ERL');
      case 0x119:
        return T('ERR');
      case 0x11a:
        return T('EXP({0})');
      case 0x11b:
        return T('FILEATTR({1}, {0})');
      case 0x11c:
        return T('FIX({0})');
      case 0x11d:
        return T('FRE({0})');
      case 0x11e:
        return T('FREEFILE');
      case 0x11f:
        return T('HEX$({0})');
      case 0x120:
        return T('INKEY$');
      case 0x121:
        return T('INP({0})');
      case 0x122:
        return T('INPUT$({0})');
      case 0x123:
        return T('INPUT$({1}, {0})');
      case 0x124:
        return T('INSTR({1}, {0})');
      case 0x125:
        return T('INSTR({2}, {1}, {0})');
      case 0x126:
        return T('INT({0})');
      case 0x127:
        return T('IOCTL$({0})');
      case 0x128:
        return T('LBOUND({0})');
      case 0x129:
        return T('LBOUND({1}, {0})');
      case 0x12a:
        return T('LCASE$({0})');
      case 0x12b:
        return T('LTRIM$({0})');
      case 0x12c:
        return T('LEFT$({1}, {0})');
      case 0x12d:
        this.skipU16();
        return T('LEN({0})');
      case 0x12e:
        return T('LOC({0})');
      case 0x12f:
        return T('LOF({0})');
      case 0x130:
        return T('LOG({0})');
      case 0x131:
        return T('LPOS({0})');
      case 0x132:
        return T('MID$({1}, {0})');
      case 0x133:
        return T('MID$({2}, {1}, {0})');
      case 0x134:
        return T('MKD$({0})');
      case 0x135:
        return T('MKDMBF$({0})');
      case 0x136:
        return T('MKI$({0})');
      case 0x137:
        return T('MKL$({0})');
      case 0x138:
        return T('MKS$({0})');
      case 0x139:
        return T('MKSMBF$({0})');
      case 0x13a:
        return T('OCT$({0})');
      case 0x13b:
        return T('PEEK({0})');
      case 0x13c:
        return T('PEN');
      case 0x13d:
        return T('PLAY');
      case 0x13e:
        return T('PMAP({1}, {0})');
      case 0x13f:
        return T('POINT({0})');
      case 0x140:
        return T('POINT({1}, {0})');
      case 0x141:
        return T('POS({0})');
      case 0x142:
        return T('RIGHT$({1}, {0})');
      case 0x143:
        return T('RND');
      case 0x144:
        return T('RND({0})');
      case 0x145:
        return T('RTRIM$({0})');
      case 0x146:
        return T('SADD({0})');
      case 0x147:
        return T('SCREEN({1}, {0})');
      case 0x148:
        return T('SCREEN({2}, {1}, {0})');
      case 0x149:
        return T('SEEK({0})');
      case 0x14a:
        return T('SETMEM({0})');
      case 0x14b:
        return T('SGN({0})');
      case 0x14c:
        return T('SHELL({0})');
      case 0x14d:
        return T('SIN({0})');
      case 0x14e:
        return T('SPACE$({0})');
      case 0x14f:
        return T('SQR({0})');
      case 0x150:
        return T('STICK({0})');
      case 0x151:
        return T('STR$({0})');
      case 0x152:
        return T('STRIG({0})');
      case 0x153:
        return T('STRING$({1}, {0})');
      case 0x154:
        return T('TAN({0})');
      case 0x155:
        return T('TIME$');
      case 0x156:
        return T('TIMER');
      case 0x157:
        return T('UBOUND({0})');
      case 0x158:
        return T('UBOUND({1}, {0})');
      case 0x159:
        return T('UCASE$({0})');
      case 0x15a:
        return T('VAL({0})');
      case 0x15b:
        return T('VARPTR({0})');
      case 0x15c:
        this.skipU16();
        return T('VARPTR$({0})');
      case 0x15d:
        return T('VARSEG({0})');
      case 0x15e:
        return T('{1} >= {0}');
      case 0x15f:
        return T('{1} > {0}');
      case 0x160:
        return T('{1} \\ {0}');
      case 0x161:
        return T('{1} IMP {0}');
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
        return T(`&H${this.u16().toString(16).toUpperCase()}`);
      case 0x168:
        return T(`&H${this.u32().toString(16).toUpperCase()}`);
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
        return T('{1} MOD {0}');
      case 0x170:
        return T('{1} * {0}');
      case 0x172:
        return T('');
      case 0x173:
        return T('');
      case 0x174:
        return T('NOT {0}')
      case 0x175:
        return T('{1} OR {0}');
      case 0x176:
        return T('{1} ^ {0}');
      case 0x177:
        return T('{1} - {0}');
      case 0x178:
        return T('-{0}');
      case 0x179:
        return T('{1} XOR {0}');
      case 0x17a:
        return T('UEVENT');
      case 0x17b:
        return T('SLEEP {0}');
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

  private skipU16() {
    // Read and discard so dataview throws if we go out of bounds.
    const _ = this.u16();
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

function getDefTypeName(param: number): string {
  switch (param) {
    case 1:
      return 'INT';
    case 2:
      return 'LNG';
    case 3:
      return 'SNG';
    case 4:
      return 'DBL';
    case 5:
      return 'STR';
  }
  return '';
}