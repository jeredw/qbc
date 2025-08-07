import { stringToAscii, LF } from "./AsciiChart";
import { mbfBytesToFloat32, mbfBytesToFloat64 } from "./statements/Bits";

// https://www.chebucto.ns.ca/~af380/GW-BASIC-tokens.html
const TOKENS_DEFAULT = new Map([
  [128, ""],
  [129, "END"],
  [130,	"FOR"],
  [131,	"NEXT"],
  [132,	"DATA"],
  [133,	"INPUT"],
  [134,	"DIM"],
  [135,	"READ"],
  [136,	"LET"],
  [137,	"GOTO"],
  [138,	"RUN"],
  [139,	"IF"],
  [140,	"RESTORE"],
  [141,	"GOSUB"],
  [142,	"RETURN"],
  [143,	"REM"],
  [144,	"STOP"],
  [145,	"PRINT"],
  [146,	"CLEAR"],
  [147,	"LIST"],
  [148,	"NEW"],
  [149,	"ON"],
  [150,	"WAIT"],
  [151,	"DEF"],
  [152,	"POKE"],
  [153,	"CONT"],
  [154, ""],
  [155, ""],
  [156,	"OUT"],
  [157,	"LPRINT"],
  [158,	"LLIST"],
  [159, ""],
  [160,	"WIDTH"],
  [161,	"ELSE"],
  [162,	"TRON"],
  [163,	"TROFF"],
  [164,	"SWAP"],
  [165,	"ERASE"],
  [166,	"EDIT"],
  [167,	"ERROR"],
  [168,	"RESUME"],
  [169,	"DELETE"],
  [170,	"AUTO"],
  [171,	"RENUM"],
  [172,	"DEFSTR"],
  [173,	"DEFINT"],
  [174,	"DEFSNG"],
  [175,	"DEFDBL"],
  [176,	"LINE"],
  [177,	"WHILE"],
  [178,	"WEND"],
  [179,	"CALL"],
  [180, ""],
  [181, ""],
  [182, ""],
  [183,	"WRITE"],
  [184,	"OPTION"],
  [185,	"RANDOMIZE"],
  [186,	"OPEN"],
  [187,	"CLOSE"],
  [188,	"LOAD"],
  [189,	"MERGE"],
  [190,	"SAVE"],
  [191,	"COLOR"],
  [192,	"CLS"],
  [193,	"MOTOR"],
  [194,	"BSAVE"],
  [195,	"BLOAD"],
  [196,	"SOUND"],
  [197,	"BEEP"],
  [198,	"PSET"],
  [199,	"PRESET"],
  [200,	"SCREEN"],
  [201,	"KEY"],
  [202,	"LOCATE"],
  [203,	""],
  [204,	"TO"],
  [205,	"THEN"],
  [206,	"TAB("],
  [207,	"STEP"],
  [208,	"USR"],
  [209,	"FN"],
  [210,	"SPC("],
  [211,	"NOT"],
  [212,	"ERL"],
  [213,	"ERR"],
  [214,	"STRING$"],
  [215,	"USING"],
  [216,	"INSTR"],
  [217,	"'"],
  [218,	"VARPTR"],
  [219,	"CSRLIN"],
  [220,	"POINT"],
  [221,	"OFF"],
  [222,	"INKEY$"],
  [223, ""],
  [224, ""],
  [225, ""],
  [226, ""],
  [227, ""],
  [228, ""],
  [229, ""],
  [230,	">"],
  [231,	"="],
  [232,	"<"],
  [233,	"+"],
  [234,	"-"],
  [235,	"*"],
  [236,	"/"],
  [237,	"^"],
  [238,	"AND"],
  [239,	"OR"],
  [240,	"XOR"],
  [241,	"EQV"],
  [242,	"IMP"],
  [243,	"MOD"],
  [244,	"\\"],
  [245,	""],
  [246,	""],
  [247,	""],
  [248,	""],
  [249,	""],
  [250,	""],
  [251,	""],
  [252,	""],
]);

const TOKENS_FD = new Map([
  [129, "CVI"],
  [130, "CVS"],
  [131, "CVD"],
  [132, "MKI$"],
  [133, "MKS$"],
  [134, "MKD$"],
  [135, ""],
  [136, ""],
  [137, ""],
  [138, ""],
  [139, "EXTERR"],
]);

const TOKENS_FE = new Map([
  [129, "FILES"],
  [130,	"FIELD"],
  [131,	"SYSTEM"],
  [132,	"NAME"],
  [133,	"LSET"],
  [134,	"RSET"],
  [135,	"KILL"],
  [136,	"PUT"],
  [137,	"GET"],
  [138,	"RESET"],
  [139,	"COMMON"],
  [140,	"CHAIN"],
  [141,	"DATE$"],
  [142,	"TIME$"],
  [143,	"PAINT"],
  [144,	"COM"],
  [145,	"CIRCLE"],
  [146,	"DRAW"],
  [147,	"PLAY"],
  [148,	"TIMER"],
  [149,	"ERDEV"],
  [150,	"IOCTL"],
  [151,	"CHDIR"],
  [152,	"MKDIR"],
  [153,	"RMDIR"],
  [154,	"SHELL"],
  [155,	"ENVIRON"],
  [156,	"VIEW"],
  [157,	"WINDOW"],
  [158,	"PMAP"],
  [159,	"PALETTE"],
  [160,	"LCOPY"],
  [161,	"CALLS"],
  [162,	""],
  [163,	""],
  [164,	"NOISE"],
  [165,	"PCOPY"],
  [166,	"TERM"],
  [167,	"LOCK"],
  [168,	"UNLOCK"],
]);

const TOKENS_FF = new Map([
  [129, "LEFT$"],
  [130, "RIGHT$"],
  [131, "MID$"],
  [132, "SGN"],
  [133, "INT"],
  [134, "ABS"],
  [135, "SQR"],
  [136, "RND"],
  [137, "SIN"],
  [138, "LOG"],
  [139, "EXP"],
  [140, "COS"],
  [141, "TAN"],
  [142, "ATN"],
  [143, "FRE"],
  [144, "INP"],
  [145, "POS"],
  [146, "LEN"],
  [147, "STR$"],
  [148, "VAL"],
  [149, "ASC"],
  [150, "CHR$"],
  [151, "PEEK"],
  [152, "SPACE$"],
  [153, "OCT$"],
  [154, "HEX$"],
  [155, "LPOS"],
  [156, "CINT"],
  [157, "CSNG"],
  [158, "CDBL"],
  [159, "FIX"],
  [160, "PEN"],
  [161, "STICK"],
  [162, "STRIG"],
  [163, "EOF"],
  [164, "LOC"],
  [165, "LOF"],
]);

export function decodeGwBasicBinaryFile(buffer: ArrayBuffer): number[] {
  buffer = decryptProgram(buffer);
  const data = new DataView(buffer);
  if (data.byteLength < 1 || data.getUint8(0) !== 0xff) {
    throw new Error('Not a GW-BASIC binary file');
  }
  let output: number[] = [];
  let offset = 1;
  const littleEndian = true;
  const lookup = (table: Map<number, string>, code: number): number[] => {
    const token = table.get(code);
    if (token === '') {
      return [];
    }
    if (!token) {
      throw new Error(`Unknown token code ${code}`);
    }
    return stringToAscii(token);
  };
  let inStringLiteral = false;
  let endOfProgram = false;
  const beginNewLine = () => {
    if (endOfProgram || data.getUint16(offset) === 0) {
      // A value of 0 means it is the end of the program.
      endOfProgram = true;
      return;
    }
    offset += 2;
    const lineNumber = data.getUint16(offset, littleEndian);
    offset += 2;
    output.push(...stringToAscii(`${lineNumber} `));
  };
  beginNewLine();
  while (!endOfProgram && offset < data.byteLength) {
    const code = data.getUint8(offset++);
    if (inStringLiteral && code !== 0 && code !== 0x22) {
      // Copy character codes verbatim inside strings, except ".
      // GW-BASIC also implicitly ends literals at the end of a line.
      output.push(code);
      continue;
    }
    switch (code) {
      case 0:  // end of line
        if (inStringLiteral) {
          output.push(...stringToAscii(`"`));
        }
        inStringLiteral = false;
        output.push(...stringToAscii(LF));
        beginNewLine();
        break;
      case 0xb: { // octal
        const value = data.getUint16(offset, littleEndian);
        offset += 2;
        output.push(...stringToAscii(`&O${value.toString(8)}`));
        break;
      }
      case 0xc: { // hex
        const value = data.getUint16(offset, littleEndian);
        offset += 2;
        output.push(...stringToAscii(`&H${value.toString(16).toUpperCase()}`));
        break;
      }
      case 0xd: // line pointer (runtime only)
        offset += 2;  // only used in running programs
        break;
      case 0xe: { // line number
        const value = data.getUint16(offset, littleEndian);
        offset += 2;
        output.push(...stringToAscii(`${value}`));
        break;
      }
      case 0xf: { // one byte constant
        const value = data.getUint8(offset++);
        output.push(...stringToAscii(`${value}`));
        break;
      }
      case 0x10: // flag constants no longer being processed
        break;
      case 0x1c: { // short integer
        const value = data.getInt16(offset, littleEndian);
        offset += 2;
        output.push(...stringToAscii(`${value}`));
        break;
      }
      case 0x1d: { // single-precision float
        const singleBytes = [
          data.getUint8(offset),
          data.getUint8(offset + 1),
          data.getUint8(offset + 2),
          data.getUint8(offset + 3),
        ];
        const value = mbfBytesToFloat32(singleBytes);
        offset += 4;
        output.push(...stringToAscii(`${value}`));
        break;
      }
      case 0x1e: // flag constants being processed
        break;
      case 0x1f: { // double-precision float
        const doubleBytes = [
          data.getUint8(offset),
          data.getUint8(offset + 1),
          data.getUint8(offset + 2),
          data.getUint8(offset + 3),
          data.getUint8(offset + 4),
          data.getUint8(offset + 5),
          data.getUint8(offset + 6),
          data.getUint8(offset + 7),
        ];
        const value = mbfBytesToFloat64(doubleBytes);
        output.push(...stringToAscii(`${value}`));
        offset += 8;
        break;
      }
      case 0x22: // "
        inStringLiteral = !inStringLiteral;
        output.push(code);
        break;
      case 0xfd:
        output.push(...lookup(TOKENS_FD, data.getUint8(offset++)));
        break;
      case 0xfe:
        output.push(...lookup(TOKENS_FE, data.getUint8(offset++)));
        break;
      case 0xff:
        output.push(...lookup(TOKENS_FF, data.getUint8(offset++)));
        break;
      default:
        if (code >= 0x11 && code <= 0x1b) {
          if (code === 0x1a && endOfProgram) {
            break;
          }
          output.push(...stringToAscii(`${code - 0x11}`));
        } else if (code >= 128) {
          if (code === 231 && offset < data.byteLength) {
            // Some older programs use => instead of >=, or =< instead of <=.
            const peek = data.getUint8(offset);
            if (peek === 230) {
              output.push(...stringToAscii(">="));
              offset++;
              break;
            }
            if (peek === 232) {
              output.push(...stringToAscii("<="));
              offset++;
              break;
            }
          }
          if (code === 0xb1 && offset < data.byteLength) {
            const peek = data.getUint8(offset);
            if (peek === 0xe9) {
              // WHILE is encoded as "WHILE +".  Skip the +.
              offset++;
            }
          }
          output.push(...lookup(TOKENS_DEFAULT, code));
        } else if (code === 0x3a) {
          // Colons have special encoding issues...
          if (offset < data.byteLength) {
            const peek = data.getUint8(offset);
            if (peek === 0xa1) {
              // ELSE is encoded as ": ELSE".  Skip the :.
              break;
            }
          }
          if (offset + 1 < data.byteLength) {
            const peek1 = data.getUint8(offset);
            const peek2 = data.getUint8(offset + 1);
            if (peek1 === 0x8f && peek2 === 0xd9) {
              // ' is encoded as :REM '.  Skip the :REM.
              offset++;
              break;
            }
          }
          output.push(code);
        } else {
          output.push(code);
        }
    }
  }
  return output;
}

function decryptProgram(buffer: ArrayBuffer): ArrayBuffer {
  const data = new DataView(buffer);
  // From https://slions.net/threads/deciphering-gw-basic-basica-protected-programs.50/
  if (data.byteLength > 0 && data.getUint8(0) !== 0xfe) {
    return buffer;
  }
  const KEY1 = [0xA9, 0x84, 0x8D, 0xCD, 0x75, 0x83, 0x43, 0x63, 0x24, 0x83, 0x19, 0xF7, 0x9A];
  const KEY2 = [0x1E, 0x1D, 0xC4, 0x77, 0x26, 0x97, 0xE0, 0x74, 0x59, 0x88, 0x7C];
  const outBytes = new Uint8Array(data.byteLength);
  outBytes[0] = 0xff;
  let keyIndex = 0;
  for (let i = 1; i < data.byteLength; i++) {
    let code = data.getUint8(i);
    code -= 11 - (keyIndex % 11);
    code ^= KEY1[keyIndex % 13];
    code ^= KEY2[keyIndex % 11];
    code += 13 - (keyIndex % 13);
    outBytes[i] = code;
    keyIndex = (keyIndex + 1) % (13 * 11);
  }
  return outBytes.buffer;
}