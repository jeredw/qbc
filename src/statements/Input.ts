import { ExprContext } from "../../build/QBasicParser.ts";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { CursorCommand } from "../Keyboard.ts";
import { cast, getDefaultValue, ILLEGAL_FUNCTION_CALL, isError, isNumeric, OVERFLOW, string, Value } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { isString, Type } from "../Types.ts";
import { Statement } from "./Statement.ts";
import { evaluateIntegerExpression, parseNumberFromString } from "../Expressions.ts";
import { Token } from "antlr4ng";
import { getSequentialReadAccessor } from "./FileSystem.ts";
import { tryIo } from "../Files.ts";
import { RuntimeError } from "../Errors.ts";

export interface InputStatementArgs {
  token: Token;
  prompt?: string;
  mark?: boolean;
  sameLine?: boolean;
  fileNumber?: ExprContext;
  variables: Variable[];
}

enum ParseStatus {
  OK,
  REDO,
  OVERFLOW
};

abstract class BaseInputStatement extends Statement {
  constructor(protected args: InputStatementArgs) {
    super();
  }

  override execute(context: ExecutionContext): ControlFlow | void {
    if (this.args.fileNumber) {
      tryIo(this.args.token, () => this.parseLineFromFile(context));
      return;
    }
    return {tag: ControlFlowTag.WAIT, promise: this.lineEditor(context)};
  }

  protected abstract parse(context: ExecutionContext, line: string): ParseStatus;

  private parseLineFromFile(context: ExecutionContext) {
    const accessor = getSequentialReadAccessor({
      expr: this.args.fileNumber!,
      context
    });
    const line = accessor.readLine();
    // input just silently fails if the line fails to parse.
    this.parse(context, line);
  }

  private lineEditor(context: ExecutionContext): Promise<void> {
    let position = 0;
    let buffer: string[] = [];
    let insert = false;
    let finished: () => void;
    const {keyboard, screen, speaker} = context.devices;
    const isWordChar = (char: string) => /[A-Za-z0-9]/.test(char);
    const toggleInsert = () => {
      insert = !insert;
      screen.configureCursor(0, 0, insert);
      screen.showCursor();
    };
    const move = (dx: number) => {
      screen.moveCursor(dx);
      position += dx;
    };
    const nextTab = () => 8 + 8 * Math.floor(position / 8);
    const prompt = () => {
      if (this.args.prompt) {
        screen.print(this.args.prompt, false);
      }
      if (this.args.mark) {
        screen.print("? ", false);
      }
      screen.configureCursor(0, 0, insert);
      screen.showCursor();
    };
    prompt();
    // So we can test non-interactively with deno which doesn't have rAF
    const frame = globalThis.requestAnimationFrame ?? setTimeout;
    const editorFrame = () => {
      const key = keyboard.input();
      if (!key) {
        frame(editorFrame);
        return;
      }
      switch (key.cursorCommand) {
        case CursorCommand.ENTER:
          if (insert) {
            toggleInsert();
          }
          screen.hideCursor();
          if (!this.args.sameLine) {
            screen.print('', true);
          }
          const status = this.parse(context, buffer.join(''));
          if (status === ParseStatus.OK) {
            finished();
            return;
          }
          screen.print('', true);
          if (status === ParseStatus.OVERFLOW) {
            screen.print(OVERFLOW.errorMessage, true);
          }
          screen.print('Redo from start', true);
          prompt();
          buffer = [];
          position = 0;
          break;
        case CursorCommand.LEFT:
          if (insert) {
            toggleInsert();
          }
          if (position > 0) {
            move(-1);
          }
          break;
        case CursorCommand.RIGHT:
          if (insert) {
            toggleInsert();
          }
          if (position >= 256) {
            speaker.beep();
          } else {
            if (position >= buffer.length) {
              buffer.push(' ');
              screen.print(' ', false);
            } else {
              screen.moveCursor(1);
            }
            position++;
          }
          break;
        case CursorCommand.FORWARD_WORD:
          if (insert) {
            toggleInsert();
          }
          while (position < buffer.length && isWordChar(buffer[position])) {
            move(1);
          }
          while (position < buffer.length && !isWordChar(buffer[position])) {
            move(1);
          }
          break;
        case CursorCommand.BACK_WORD:
          if (insert) {
            toggleInsert();
          }
          if (position > 0) {
            move(-1);
          }
          while (position > 0 && !isWordChar(buffer[position])) {
            move(-1);
          }
          while (position > 0 && isWordChar(buffer[position - 1])) {
            move(-1);
          }
          break;
        case CursorCommand.HOME:
          if (insert) {
            toggleInsert();
          }
          move(-position);
          break;
        case CursorCommand.END:
          if (insert) {
            toggleInsert();
          }
          move(buffer.length - position);
          break;
        case CursorCommand.INSERT:
          toggleInsert();
          break;
        case CursorCommand.BACKSPACE:
          if (position > 0) {
            move(-1);
          }
          // fallthrough 
        case CursorCommand.DELETE:
          if (buffer.length > 0 && position < buffer.length) {
            buffer.splice(position, 1);
            screen.print(buffer.slice(position).join('') + ' ', false);
            screen.moveCursor(-(buffer.length - position + 1));
          }
          break;
        case CursorCommand.DELETE_TO_END:
          if (insert) {
            toggleInsert();
          }
          const numToDelete = buffer.length - position;
          buffer.splice(position, numToDelete);
          screen.print(' '.repeat(numToDelete), false);
          screen.moveCursor(-numToDelete);
          break;
        case CursorCommand.DELETE_LINE:
          if (insert) {
            toggleInsert();
          }
          screen.moveCursor(-position);
          screen.print(' '.repeat(buffer.length), false);
          screen.moveCursor(-buffer.length);
          buffer = [];
          position = 0;
          break;
        default:
          if (!key.char) {
            break;
          }
          const text = key.char === '\t' ? ' '.repeat(nextTab() - position) : key.char;
          if (position >= 256 ||
            !insert && position + text.length > 255 ||
            insert && (buffer.length + text.length) > 255) {
            speaker.beep();
          } else if (insert) {
            for (let i = 0; i < text.length; i++) {
              buffer.splice(position + i, 0, text[i]);
            }
            screen.print(buffer.slice(position).join(''), false);
            position += text.length;
            screen.moveCursor(-(buffer.length - position));
          } else {
            for (let i = 0; i < text.length; i++) {
              buffer.splice(position++, 1, text[i]);
            }
            screen.print(text, false);
          }
      }
      frame(editorFrame);
    };
    return new Promise((resolve) => {
      finished = resolve;
      frame(editorFrame);
    });
  }
}

export class LineInputStatement extends BaseInputStatement {
  constructor(args: InputStatementArgs) {
    super(args);
  }

  protected override parse(context: ExecutionContext, line: string): ParseStatus {
    const result = this.args.variables[0];
    context.memory.write(result, string(line));
    return ParseStatus.OK;
  }
}

export class InputStatement extends BaseInputStatement {
  constructor(args: InputStatementArgs) {
    super(args);
  }

  protected override parse(context: ExecutionContext, line: string): ParseStatus {
    let pos = 0;
    const expect = (ch: string) => {
      if (pos >= line.length || line[pos] != ch) {
        throw new Error();
      }
      pos++;
    };
    const skipWhitespace = () => {
      while (pos < line.length && ' \r\n'.includes(line[pos])) {
        pos++;
      }
    };
    const stringItem = (): Value => {
      skipWhitespace();
      if (pos === line.length) {
        return string("");
      }
      if (pos >= line.length) {
        throw new Error();
      }
      if (line[pos] === '"') {
        pos++;
        const start = pos;
        while (pos < line.length && line[pos] != '"') {
          pos++;
        }
        if (pos >= line.length) {
          throw new Error();
        }
        pos++;
        return string(line.slice(start, pos - 1));
      }
      const start = pos;
      while (pos < line.length && line[pos] != ',') {
        pos++;
      }
      return string(line.slice(start, pos).trim());
    };
    const numericItem = (type: Type) => {
      const start = pos;
      while (pos < line.length && line[pos] != ',') {
        pos++;
      }
      const value = parseNumberFromString(line.slice(start, pos).trim());
      if (value === undefined) {
        throw new Error();
      }
      return cast(value, type);
    };
    const separator = () => {
      skipWhitespace();
      expect(',');
      skipWhitespace();
    };
    const items: Value[] = [];
    try {
      for (let i = 0; i < this.args.variables.length; i++) {
        const variable = this.args.variables[i];
        if (isString(variable.type)) {
          const data = stringItem(); 
          items.push(data);
        } else {
          const data = numericItem(variable.type);
          if (isError(data)) {
            if (data.errorMessage === 'Overflow') {
              return ParseStatus.OVERFLOW;
            }
            return ParseStatus.REDO;
          }
          items.push(data);
        }
        if (i != this.args.variables.length - 1) {
          separator();
        }
      }
      skipWhitespace();
      if (pos < line.length) {
        throw new Error();
      }
    } catch (e: unknown) {
      return ParseStatus.REDO;
    }
    for (let i = 0; i < this.args.variables.length; i++) {
      const variable = this.args.variables[i];
      context.memory.write(variable, items[i]);
    }
    return ParseStatus.OK;
  }
}

export class InputFileStatement extends Statement {
  constructor(private args: InputStatementArgs) {
    super();
  }

  override execute(context: ExecutionContext) {
    tryIo(this.args.token, () => {
      const accessor = getSequentialReadAccessor({
        expr: this.args.fileNumber!,
        context
      });
      let char = '';
      const nextChar = () => {
        char = accessor.readChars(1);
      };
      const nextField = () => {
        // In most cases, char is the delimiter after the previous field.
        // But if the last field ended with '"', skip over one following comma.
        const skip = char === '"' ? ', \r\n' : ' \r\n';
        if (!accessor.eof()) {
          nextChar();
        }
        while (!accessor.eof() && skip.includes(char)) {
          const delim = char === ',';
          nextChar();
          if (delim) {
            break;
          }
        }
        while (!accessor.eof() && ' \r\n'.includes(char)) {
          nextChar();
        }
      };
      const readUntilStringDelimiter = () => {
        let result = "";
        if (char === '"') {
          nextChar();
          while (!accessor.eof() && char !== '"') {
            result += char;
            nextChar();
          }
          return result;
        }
        while (!accessor.eof() && !",\r\n".includes(char)) {
          result += char;
          nextChar();
        }
        return result;
      };
      const readUntilNumberDelimiter = () => {
        let result = "";
        while (!accessor.eof() && !", \r\n".includes(char)) {
          result += char;
          nextChar();
        }
        return result;
      };
      for (let i = 0; i < this.args.variables.length; i++) {
        const variable = this.args.variables[i];
        nextField();
        if (isString(variable.type)) {
          const field = readUntilStringDelimiter();
          context.memory.write(variable, string(field));
        } else {
          const field = readUntilNumberDelimiter();
          let value = parseNumberFromString(field.trim()) ?? getDefaultValue(variable);
          if (isNumeric(value)) {
            value = cast(value, variable.type);
          }
          if (isError(value) && value.errorMessage === 'Overflow') {
            throw RuntimeError.fromToken(this.args.token, value);
          }
          context.memory.write(variable, value);
        }
      }
    });
  }
}

export class InputFunction extends Statement {
  constructor(
    private token: Token,
    private n: ExprContext,
    private fileNumber: ExprContext | undefined,
    private result: Variable
  ) {
    super();
  }

  override execute(context: ExecutionContext): ControlFlow | void {
    const numBytes = evaluateIntegerExpression(this.n, context.memory);
    if (numBytes < 0) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    if (numBytes === 0) {
      context.memory.write(this.result, string(""));
      return;
    }
    if (this.fileNumber) {
      let result = "";
      tryIo(this.token, () => {
        const accessor = getSequentialReadAccessor({
          expr: this.fileNumber!,
          context
        });
        result = accessor.readChars(numBytes);
      });
      context.memory.write(this.result, string(result));
      return;
    }
    return {tag: ControlFlowTag.WAIT, promise: this.readStdin(numBytes, context)};
  }

  private readStdin(numBytes: number, context: ExecutionContext): Promise<void> {
    let buffer: string[] = [];
    let finished: () => void;
    const frame = globalThis.requestAnimationFrame ?? setTimeout;
    const keyWaitFrame = () => {
      const key = context.devices.keyboard.input();
      if (!key || !key.char) {
        frame(keyWaitFrame);
        return;
      }
      buffer.push(key.char);
      if (buffer.length >= numBytes) {
        context.memory.write(this.result, string(buffer.join('')));
        finished();
        return;
      }
      frame(keyWaitFrame);
    };
    return new Promise((resolve) => {
      finished = resolve;
      frame(keyWaitFrame);
    });
  }
}