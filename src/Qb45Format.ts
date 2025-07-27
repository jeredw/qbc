import { asciiToString, stringToAscii } from "./AsciiChart";

export function decodeQb45BinaryFile(buffer: ArrayBuffer): number[] {
  return new Qb45Loader(buffer).decode();
}

// Offset of the first byte of symbol data (preceded by a 2-byte length).
const SYMBOL_TABLE_START = 28;

// A list of CP-437 ASCII character codes.
type Ascii = number[];

enum Tag {
  DECLARATION_KEYWORD,
  DECLARATION_LIST,
  AS_TYPE,
  CASE,
  COORDINATE,
}

// An entry on the p-code parse stack.
interface Entry {
  pcode?: number;  // Token that pushed this entry.
  tag?: Tag;  // A tag identifying this type of token.
  text: Ascii;  // Text associated.
}

// A section of code in the program image.
interface Section {
  offset: number;
  size: number;
}

// Loosely based on the QB45BIN.bas utility from the QB64 project, and a lot of
// random experimentation.
class Qb45Loader {
  data: DataView;
  offset: number = 0;
  output: number[] = [];
  stack: Entry[] = [];
  procedureType = '';
  endOfSection = false;
  endOfLine = false;

  constructor(buffer: ArrayBuffer) {
    this.data = new DataView(buffer);
  }

  decode(): number[] {
    const magic = this.u16();
    const version = this.u16();
    if (magic != 0xfc || version != 1) {
      throw new Error('Not a QB45 binary file');
    }
    // Skip over the symbol table.
    this.offset = SYMBOL_TABLE_START - 2;
    const symbolTableSize = this.u16();
    this.offset += symbolTableSize;
    const sections: Section[] = [];
    while (this.offset < this.data.byteLength) {
      const size = this.u16();
      sections.push({offset: this.offset, size});
      // Skip code and metadata.
      this.offset += size + 17;
      if (this.offset >= this.data.byteLength) {
        break;
      }
      const nameLength = this.u16();
      this.offset += nameLength + 3;
    }
    for (const section of sections) {
      if (this.output.length > 0) {
        this.output.push(...stringToAscii('\n\n'))
      }
      this.loadSection(section);
    }
    return this.output;
  }

  private loadSection(section: Section) {
    this.stack = [];
    this.endOfLine = false;
    this.endOfSection = false;
    this.offset = section.offset;
    const end = Math.min(this.data.byteLength, section.offset + section.size);
    let firstLine = true;
    while (this.offset < end) {
      const {pcode, tag, text} = this.parseToken();
      if (this.endOfLine) {
        for (let i = 0; i < this.stack.length; i++) {
          this.output.push(...this.stack[i].text);
        }
        if (this.endOfSection) {
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
        this.push({pcode, tag, text});
      }
    }
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

  private parseToken(): {pcode?: number, tag?: Tag, text?: Ascii} {
    const rawToken = this.u16();
    const pcode = rawToken & 0x03ff;
    const param = (rawToken >> 10) & 0x3f;
    const S = stringToAscii;
    const T = (template: string, tag?: Tag): Entry => {
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
      const parts: Ascii[] = [];
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
          case '{tab-to-column}':
            this.skipU16();
            parts.push(S(' '));
            break;
          default:
            parts.push(S(field));
        }
      }
      return {pcode, tag, text: parts.flat()};
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
      truncate(params);
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
    const arrayDeclaration = (): Entry => {
      let stackIndex = 0;
      let asType = '';
      if (this.stack.at(-1)?.tag === Tag.AS_TYPE) {
        stackIndex++;
        asType = '{0}';
      }
      const numBounds = this.u16();
      if (numBounds % 2 !== 0) {
        throw new Error('Expecting an even number of array bounds');
      }
      const bounds: string[] = [];
      for (let i = 0; i < numBounds / 2; i++) {
        const upper = stackIndex++;
        const lower = stackIndex++;
        if (this.stack.at(-1 - lower)?.pcode !== 0x018) {
          bounds.unshift(`{${lower}} TO {${upper}}`);
        } else {
          // Still have to pop the dummy lower index (it will be an empty string).
          bounds.unshift(`{${upper}}{${lower}}`);
        }
      }
      const indices = `(${bounds.join(', ')})`;
      if (this.stack.at(-1 - stackIndex)?.tag === Tag.DECLARATION_LIST) {
        // Add to declaration list.
        return T(`{${stackIndex}}, {id+}${indices}${asType}`, Tag.DECLARATION_LIST);
      }
      if (this.stack.at(-1 - stackIndex)?.tag === Tag.DECLARATION_KEYWORD) {
        // Begin new declaration list.
        return T(`{${stackIndex}} {id+}${indices}${asType}`, Tag.DECLARATION_LIST);
      }
      return T(`{id+}${indices}${asType}`, Tag.DECLARATION_LIST);
    };
    const arrayExpression = (): Entry => {
      const numIndices = this.u16();
      let indexList = '';
      if (!(numIndices & 0x8000)) {
        const indices: string[] = [];
        for (let i = 0; i < numIndices; i++) {
          indices.unshift(`{${i}}`);
        }
        indexList = `(${indices.join(', ')})`;
      }
      return T(`{id+}${indexList}`);
    };
    const call = ({keyword, parenthesis}: {keyword: string, parenthesis: boolean}): Entry => {
      const numParams = this.i16();
      const params: string[] = [];
      for (let i = 0; i < numParams; i++) {
        params.unshift(`{${i}}`);
      }
      let paramList = params.join(', ');
      if (numParams > 0 && parenthesis) {
        paramList = `(${paramList})`;
      }
      const space = keyword ? '' : ' ';
      return T(`${keyword}{id}${space}${paramList}`);
    };
    const procedure = ({keyword, parenthesis}: {keyword?: string, parenthesis?: boolean}): Entry => {
      this.offset += 2;  // Skip junk?
      let name = asciiToString(this.id(this.u16()));
      const flags = this.u16();
      if (flags & 0x80) {
        name += getSigil(flags & 7);
      }
      const procedureTypeFlag = (flags >> 8) & 3;
      this.procedureType = (
        procedureTypeFlag === 1 ? 'SUB' :
        procedureTypeFlag === 2 ? 'FUNCTION' :
        procedureTypeFlag === 3 ? 'DEF' : ''
      );
      name = `${this.procedureType} ${name}`;
      if (keyword) {
        name = `${keyword} ${name}`;
      }
      const numArguments = this.i16();
      if (numArguments === -1) {
        // A value of -1 signals that there are no trailing parentheses in a declaration.
        parenthesis = false;
      }
      const params: string[] = [];
      for (let i = 0; i < numArguments; i++) {
        let argName = asciiToString(this.id(this.u16()));
        const argFlags = this.u16();
        const argType = this.u16();
        if (argFlags & 0x200) {
          argName += getSigil(argType);
        }
        if (argFlags & 0x400) {
          argName += '()';
        }
        if (argFlags & 0x800) {
          argName = `SEG ${argName}`;
        }
        if (argFlags & 0x1000) {
          argName = `BYVAL ${argName}`;
        }
        if (argFlags & 0x2000) {
          const typeName = asciiToString(this.getTypeName(argType));
          argName = `${argName} AS ${typeName}`;
        }
        params.push(argName);
      }
      let argumentList = params.join(', ');
      if (parenthesis || argumentList) {
        argumentList = ` (${argumentList})`;
      }
      if (flags & 0x8000) {
        name = `${name} CDECL`;
      }
      const aliasLength = (flags >> 10) & 0x1f;
      if (aliasLength > 0) {
        const aliasName = asciiToString(this.string(aliasLength));
        name = `${name} ALIAS "${aliasName}"`;
      }
      return {pcode, text: [...S(name), ...S(argumentList)]};
    };
    const computedGoto = (keyword: string): Entry => {
      const length = this.i16() / 2;
      const ids: string[] = [];
      for (let i = 0; i < length; i++) {
        ids.push(asciiToString(this.id(this.u16())));
      }
      return T(`ON {0} ${keyword} ${ids.join(', ')}`);
    };
    const lineStatement = (): Entry => {
      const params: string[] = [];
      const boxStyle = this.u16() & 3;
      const mask = (pcode - 0xbb) & 3;
      let paramCount = 0;
      params.unshift(mask & 2 ? `{${paramCount++}}` : '');
      params.unshift(
        boxStyle === 1 ? 'B' :
        boxStyle === 2 ? 'BF' : ''
      );
      params.unshift(mask & 1 ? `{${paramCount++}}` : '');
      params.unshift(`{${paramCount++}}`);
      truncate(params);
      return T(`LINE ${params.join(', ')}`);
    };
    const inputFormat = ({promptArgument}: {promptArgument: number}): string => {
      const flags = this.u16();
      let semicolon = flags & 2 ? ';' : '';
      let promptSeparator = flags & 1 ? ',' : ';';
      let promptString = flags & 4 ? `{${promptArgument}}${promptSeparator}` : '';
      let spaceBeforePrompt = semicolon && promptString ? ' ' : '';
      return `${semicolon}${spaceBeforePrompt}${promptString}`;
    };
    switch (pcode) {
      case 0x000:
        this.endOfLine = true;
        return T(' '.repeat(param));
      case 0x001:
        this.endOfLine = true;
        return T('{tab-to-column}');
      case 0x002:
        this.skipU16();
        this.endOfLine = true;
        return {};
      case 0x003:
        this.skipU16();
        this.endOfLine = true;
        return {pcode, text: [...S(' '.repeat(this.u16()))]};
      // 34 and 35 are "used in $INCLUDEd lines".  Maybe .BI files?
      case 0x034:
      case 0x004: {
        this.endOfLine = true;
        this.skipU16();
        const label = this.id(this.u16());
        const separator = label[0] >= '0'.charCodeAt(0) && label[0] <= '9'.charCodeAt(0) ? ' ' : ': ';
        return {pcode, text: [...label, ...S(separator)]};
      }
      case 0x035:
      case 0x005: {
        this.endOfLine = true;
        this.skipU16();
        const label = this.id(this.u16());
        const indent = ' '.repeat(1 + this.u16());
        const separator = label[0] >= '0'.charCodeAt(0) && label[0] <= '9'.charCodeAt(0) ? '' : ':';
        return {pcode, text: [...label, ...S(separator), ...S(indent)]};
      }
      case 0x006:
        return T(': ');
      case 0x007:
        return T(':{tab-to-column}');
      case 0x008:
        this.endOfLine = true;
        this.endOfSection = true;
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
      case 0x00c:
        if (this.stack.at(-2)?.pcode === 0x023) {
          // First parameter of CONST.
          return T('{1} {id+} = {0}');
        }
        if (this.stack.at(-2)?.pcode === 0x00c) {
          // Append parameter to CONST parameter list.
          return T('{1}, {id+} = {0}');
        }
        return T('{id+} = {0}');
      case 0x00d: {
        const asType = this.stack.at(-1)?.tag === Tag.AS_TYPE;
        if (this.stack.at(-2)?.tag === Tag.DECLARATION_LIST && asType) {
          // Append parameter to declaration list with AS type on stack.
          return T('{1}, {id+}{0}', Tag.DECLARATION_LIST);
        }
        if (this.stack.at(-1)?.tag === Tag.DECLARATION_LIST) {
          // Append parameter to declaration list.
          return T('{0}, {id+}', Tag.DECLARATION_LIST);
        }
        if (this.stack.at(-2)?.tag === Tag.DECLARATION_KEYWORD && asType) {
          // Begin declaration list with AS type on stack.
          return T('{1} {id+}{0}', Tag.DECLARATION_LIST);
        }
        if (this.stack.at(-1)?.tag === Tag.DECLARATION_KEYWORD) {
          // Begin declaration list.
          return T('{0} {id+}', Tag.DECLARATION_LIST);
        }
        if (asType) {
          return T('{id+}{0}', Tag.DECLARATION_LIST);
        }
        return T('{id+}', Tag.DECLARATION_LIST);
      }
      case 0x00e: {
        const nextToken = this.data.getUint16(this.offset + 4, true) & 0x3ff;
        if (nextToken === 0x01c) {
          // Array expressions in REDIM parameter lists parse as array declarations.
          return arrayDeclaration();
        }
        return arrayExpression();
      }
      case 0x00f: {
        const item = arrayExpression();
        const value = this.pop();
        return {pcode, text: [...item.text, ...S(' = '), ...value.text]};
      }
      case 0x010:
        return arrayDeclaration();
      case 0x011:
        return T('{0}.{id}');
      case 0x012:
        return T('{0}.{id} = {1}');
      case 0x015:
      case 0x016: {
        const typeName = this.getTypeName(this.u16());
        this.skipU16();  // Skip tab-to-column.
        return {pcode, text: [...S(' AS '), ...typeName], tag: Tag.AS_TYPE};
      }
      case 0x017:
      case 0x018:
        // 0x018 is used as a dummy token in array declarations when only one bound is provided for a dimension.
        return T('');
      case 0x019:
        // Used in user-defined type declarations.
        return T('{id}');
      case 0x01a:
        return T('SHARED');  // Modifier on DIM/REDIM/COMMON.
      case 0x01b:
        return defType();
      case 0x01c:
        if (this.stack.at(-2)?.pcode === 0x01c) {
          // Append another variable to a REDIM parameter list.
          return T('{1}, {0}');
        }
        if (this.stack.at(-2)?.pcode === 0x01a) {
          // REDIM SHARED.
          return T('REDIM {1} {0}');
        }
        return T('REDIM {0}');
      case 0x01d:
        this.skipU16();
        return T('END TYPE');
      case 0x01e:
        this.skipU16();
        return T('SHARED', Tag.DECLARATION_KEYWORD);
      case 0x01f:
        this.skipU16();
        return T('STATIC', Tag.DECLARATION_KEYWORD);
      case 0x020:
        this.skipU16();
        return T('TYPE {id}');
      case 0x023:
        return T('CONST');
      case 0x024:
        // Breakpoints.
        return {};
      case 0x025:
        return T('BYVAL {0}');
      case 0x026:
        // Used for single-line DEF FN definitions.
        return T('{1} = {0}');
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
      // Tokens 0x034 and 0x035 are handled above.
      case 0x037:
        return call({keyword: 'CALL ', parenthesis: true});
      case 0x038:
        return call({keyword: '', parenthesis: false});
      case 0x039:
        return call({keyword: 'CALLS ', parenthesis: true});
      case 0x03a:
        return T('CASE ELSE');
      case 0x03b:
        if (this.stack.at(-2)?.tag === Tag.CASE) {
          return T('{1}, {0}', Tag.CASE);
        }
        return T('CASE {0}', Tag.CASE);
      case 0x03c:
        if (this.stack.at(-3)?.tag === Tag.CASE) {
          return T('{2}, {1} TO {0}', Tag.CASE);
        }
        return T('CASE {1} TO {0}', Tag.CASE);
      case 0x03d:
        if (this.stack.at(-2)?.tag === Tag.CASE) {
          return T('{1}, IS = {0}', Tag.CASE);
        }
        return T('CASE IS = {0}', Tag.CASE);
      case 0x03e:
        if (this.stack.at(-2)?.tag === Tag.CASE) {
          return T('{1}, IS < {0}', Tag.CASE);
        }
        return T('CASE IS < {0}', Tag.CASE);
      case 0x03f:
        if (this.stack.at(-2)?.tag === Tag.CASE) {
          return T('{1}, IS > {0}', Tag.CASE);
        }
        return T('CASE IS > {0}', Tag.CASE);
      case 0x040:
        if (this.stack.at(-2)?.tag === Tag.CASE) {
          return T('{1}, IS <= {0}', Tag.CASE);
        }
        return T('CASE IS <= {0}', Tag.CASE);
      case 0x041:
        if (this.stack.at(-2)?.tag === Tag.CASE) {
          return T('{1}, IS >= {0}', Tag.CASE);
        }
        return T('CASE IS >= {0}', Tag.CASE);
      case 0x042:
        if (this.stack.at(-2)?.tag === Tag.CASE) {
          return T('{1}, IS <> {0}', Tag.CASE);
        }
        return T('CASE IS <> {0}', Tag.CASE);
      case 0x043:
        return T('ON');
      case 0x044:
        return procedure({keyword: 'DECLARE', parenthesis: true});
      case 0x045:
        // Used for def fn procedures.
        this.skipU16();
        return procedure({parenthesis: false});
      case 0x046:
        return T('DO');
      case 0x047:
        this.skipU16();
        return T('DO UNTIL {0}');
      case 0x048:
        this.skipU16();
        return T('DO WHILE {0}');
      case 0x049:
        this.skipU16();
        return T('ELSE ');
      case 0x04a:
        // Implicit GOTO line number for 4c.
        return T('{id}');
      case 0x04c:
        // Used for inline if ELSE.
        return T(' ELSE ');
      case 0x04d:
        this.skipU16();
        return T('ELSEIF {0} THEN');
      case 0x04e:
        return T('END');
      case 0x04f:
        return T('END DEF');
      case 0x050:
        return T('END IF');
      case 0x051:
        return T(`END ${this.procedureType}`);
      case 0x052:
        return T('END SELECT');
      case 0x053:
        this.skipU16();
        return T('EXIT DO');
      case 0x054:
        this.skipU16();
        return T('EXIT FOR');
      case 0x055:
        this.skipU16();
        return T(`EXIT ${this.procedureType}`);
      case 0x056:
        this.skipU16();
        this.skipU16();
        return T('FOR {2} = {1} TO {0}');
      case 0x057:
        this.skipU16();
        this.skipU16();
        return T('FOR {3} = {2} TO {1} STEP {0}');
      case 0x058:
        // FUNCTION definition.
        return procedure({});
      case 0x059:
        return T('GOSUB {id}');
      case 0x05b:
        return T('GOTO {id}');
      case 0x05d:
        this.skipU16();
        return T('IF {0} THEN ');
      case 0x05e:
        return T('IF {0} THEN {id}');
      case 0x060:
        return T('IF {0} GOTO {id}');
      case 0x061:
        this.skipU16();
        return T('IF {0} THEN');
      case 0x062:
        this.skipU16();
        return T('LOOP');
      case 0x063:
        this.skipU16();
        return T('LOOP UNTIL {0}');
      case 0x064:
        this.skipU16();
        return T('LOOP WHILE {0}');
      case 0x065:
        this.skipU16();
        this.skipU16();
        return T('NEXT');
      case 0x066:
        this.skipU16();
        this.skipU16();
        if (this.stack.at(-2)?.pcode === 0x066) {
          return T('{1}, {0}');
        }
        return T('NEXT {0}');
      case 0x067:
        return T('ON ERROR GOTO {id}');
      case 0x068:
        return computedGoto('GOSUB');
      case 0x069:
        return computedGoto('GOTO');
      case 0x06a:
        return T('RESTORE');
      case 0x06b:
        return T('RESTORE {id}');
      case 0x06c:
        return T('RESUME');
      case 0x06d:
        return T('RESUME {id}');
      case 0x06e:
        return T('RESUME NEXT');
      case 0x06f:
        return T('RETURN');
      case 0x070:
        return T('RETURN {id}');
      case 0x071:
        return T('RUN {0}');
      case 0x072:
        return T('RUN {id}');
      case 0x073:
        return T('RUN');
      case 0x074:
        this.skipU16();
        return T('SELECT CASE {0}');
      case 0x075:
        this.skipU16();
        return T('STOP');
      case 0x076:
        // SUB definition.
        return procedure({});
      case 0x077:
        return T('WAIT {1}, {0}')
      case 0x078:
        return T('WAIT {2}, {1}, {0}')
      case 0x079:
        this.skipU16();
        return T('WEND')
      case 0x07a:
        this.skipU16();
        return T('WHILE {0}')
      // 7b and 7c are probably used in watch mode.
      case 0x07b:
      case 0x07c:
        return {};
      // 7e, 7f, and 80 are dummy tokens for optional arguments in the circle statement.
      case 0x07e:
      case 0x07f:
      case 0x080:
        return T('{0}');
      case 0x081:
        return T('({1}, {0})', Tag.COORDINATE);
      case 0x082:
        return T('STEP({1}, {0})', Tag.COORDINATE);
      case 0x083:
        if (this.stack.at(-3)?.tag === Tag.COORDINATE) {
          return T('{2}-({1}, {0})');
        }
        return T('-({1}, {0})');
      case 0x084:
        if (this.stack.at(-3)?.tag === Tag.COORDINATE) {
          return T('{2}-STEP({1}, {0})');
        }
        return T('-STEP({1}, {0})');
      case 0x085:
        return T('FIELD {0}');
      case 0x086:
        return T(', {1} AS {0}');
      case 0x087:
        // Used for INPUT # and LINE INPUT # statements.
        return T('INPUT {0},');
      case 0x088:
        // Used to attach variable lists to INPUT statements.
        return T('{1} {0}');
      case 0x089: {
        const tokenLengthInBytes = roundUp(this.u16());
        const format = inputFormat({promptArgument: 0});
        this.offset += tokenLengthInBytes - 2;  // inputFormat reads flags.
        return format ? T(`INPUT ${format}`) : T('INPUT');
      }
      case 0x08a:
        return T('#{0}');
      case 0x08c:
        this.skipU16();
        return {};
      case 0x097: {
        const length = this.u16();
        const start = this.offset;
        const tabOffset = this.u16();
        const comment = this.string(length - 2);
        this.offset = start + roundUp(length);
        return {pcode, text: [...S(`${tabOffset > 0 ? ' ' : ''}'`), ...comment]};
      }
      case 0x099: {
        const length = this.u16();
        const start = this.offset;
        const path = this.string(length);
        this.offset = start + roundUp(length);
        return {pcode, text: [...S('$INCLUDE: \''), ...path]};
      }
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
      case 0x0a7:
        return T('DATE$ = {0}');
      case 0x0a8:
        return T('DEF SEG');
      case 0x0a9:
        return T('DEF SEG = {0}');
      case 0x0aa:
        return T('DRAW {0}');
      case 0x0ab:
        return T('ENVIRON {0}');
      case 0x0ad:
        return T('ERROR {0}');
      case 0x0ae:
        return T('FILES');
      case 0x0af:
        return T('FILES {0}');
      case 0x0b0:
        return T('GET {0}');
      case 0x0b1:
        return T('GET {1}, {0}');
      case 0x0b2:
        this.skipU16();
        return T('GET {1}, , {0}');
      case 0x0b3:
        this.skipU16();
        return T('GET {2}, {1}, {0}');
      case 0x0b4:
        return T('GET {1}, {0}');
      case 0x0b6:
        // INPUT variable list.
        if (this.stack.at(-2)?.pcode === 0x0b6) {
          return T('{1}, {0}');
        }
        return T('{0}');
      case 0x0b7:
        return T('IOCTL {1}, {0}');
      case 0x0b9:
        return T('KEY {1}, {0}');
      case 0x0ba:
        return T('KILL {0}');
      case 0x0bb:
      case 0x0bc:
      case 0x0bd:
      case 0x0be:
        return lineStatement();
      case 0x0bf:
        return T('LET ');
      case 0x0c0: {
        if (this.stack.at(-2)?.pcode === 0x087) {
          // Handle LINE INPUT # statement.
          this.skipU16();
          return T('LINE {1} {0}');
        }
        const format = inputFormat({promptArgument: 1});
        return format ? T(`LINE INPUT ${format} {0}`) : T('LINE INPUT {0}');
      }
      case 0x0c4:
        return T('LSET {0} = {1}');
      case 0x0c5:
        return T('MID$({0}, {2}) = {1}');
      case 0x0c6:
        return T('MID$({0}, {3}, {2}) = {1}');
      case 0x0c7:
        return T('MKDIR {0}');
      case 0x0c8:
        return T('NAME {1} AS {0}');
      case 0x0cb:
        return T('OPEN {2}, {1}, {0}');
      case 0x0cc:
        return T('OPEN {3}, {2}, {1}, {0}');
      case 0x0cd:
        return T('OPTION BASE 0');
      case 0x0ce:
        return T('OPTION BASE 1');
      case 0x0cf:
        return T('OUT {1}, {0}');
      case 0x0d1:
        return T('PAINT {3}, {2}, {1}, {0}');
      case 0x0d2:
        return T('PALETTE');
      case 0x0d3:
        return T('PALETTE {1}, {0}');
      case 0x0d4:
        return T('PALETTE {0}');
      case 0x0d5:
        return T('PCOPY {1}, {0}');
      case 0x0d6:
        return T('PLAY {0}');
      case 0x0d7:
        return T('POKE {1}, {0}');
      case 0x0d8:
        return T('PRESET {0}');
      case 0x0d9:
        return T('PRESET {1}, {0}');
      case 0x0da:
        return T('PSET {0}');
      case 0x0db:
        return T('PSET {1}, {0}');
      case 0x0dd:
        return T('PUT {1}, {0}');
      case 0x0de:
        this.skipU16();
        return T('PUT {1}, , {0}');
      case 0x0df:
        this.skipU16();
        return T('PUT {2}, {1}, {0}');
      case 0x0e0:
        return T('RANDOMIZE');
      case 0x0e1:
        return T('RANDOMIZE {0}');
      case 0x0e2:
        if (this.stack.at(-2)?.pcode === 0x0e2) {
          return T('{1}, {0}');
        }
        return T('READ {0}');
      case 0x0e3: {
        const length = this.u16();
        return {text: [...S('REM'), ...this.string(length)]};
      }
      case 0x0e4:
        return T('RESET');
      case 0x0e5:
        return T('RMDIR {0}');
      case 0x0e6:
        return T('RSET {0} = {1}');
      case 0x0e8:
        return T('SEEK {1}, {0}');
      case 0x0e9:
        return T('SHELL');
      case 0x0ea:
        return T('SHELL {0}');
      case 0x0eb:
        return T('SLEEP');
      case 0x0ec:
        return T('SOUND {1}, {0}');
      case 0x0ed:
        this.skipU16();
        return T('SWAP {1}, {0}');
      case 0x0ee:
        return T('SYSTEM');
      case 0x0ef:
        return T('TIME$ = {0}');
      case 0x0f0:
        return T('TROFF');
      case 0x0f1:
        return T('TRON');
      case 0x0f4:
        return T('VIEW');
      case 0x0f5:
        return T('VIEW PRINT');
      case 0x0f6:
        return T('VIEW PRINT {1} TO {0}');
      case 0x0f9:
        return T('WIDTH LPRINT {0}')
      case 0x0fa:
        return T('WIDTH {1}, {0}')
      case 0x0fb:
        return T('WINDOW ({3}, {2})-({1}, {0})')
      case 0x0fc:
        return T('WINDOW')
      case 0x0fd:
        return T('WINDOW SCREEN ({3}, {2})-({1}, {0})')
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
        const string = this.string(length);
        if (length & 1) {
          // Strings are padded to 2-byte boundaries.
          this.offset++;
        }
        return {pcode, text: [...S('"'), ...string, ...S('"')]};
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
      case 0x17c: {
        this.skipU16();
        const maxLength = this.u16();
        this.skipU16();  // Skip tab-to-column.
        return {pcode, text: [...S(' AS STRING * '), ...S(`${maxLength}`)], tag: Tag.AS_TYPE};
      }
      case 0x17d:
        this.skipU16();
        if (this.stack.at(-1)?.pcode === 0x01a) {
          // DIM SHARED.
          return T('DIM {0}', Tag.DECLARATION_KEYWORD);
        }
        return T('DIM', Tag.DECLARATION_KEYWORD);
    }
    throw new Error(`unrecognized token: ${pcode}`);
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

  private byteLengthRoundedUp(): number {
    const length = this.u16();
    return (length & 1) ? length + 1 : length;
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

  private getTypeName(code: number): Ascii {
    return code <= 5 ? stringToAscii(getBuiltinTypeName(code)) : this.id(code);
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

function getBuiltinTypeName(param: number): string {
  switch (param) {
    case 1:
      return 'INTEGER';
    case 2:
      return 'LONG';
    case 3:
      return 'SINGLE';
    case 4:
      return 'DOUBLE';
    case 5:
      return 'STRING';
  }
  return 'ANY';
}

function roundUp(n: number): number {
  return (n & 1) ? n + 1 : n;
}

function truncate(params: string[]) {
  let lastValidArgument = 0;
  for (lastValidArgument = params.length - 1; lastValidArgument >= 0; lastValidArgument--) {
    if (params[lastValidArgument] !== '') {
      break;
    }
  }
  params.length = lastValidArgument + 1;
}