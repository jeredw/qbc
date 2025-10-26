import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { CursorCommand } from "../Keyboard.ts";
import { cast, getDefaultValue, isError, isNumeric, string, Value } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { isString, Type } from "../Types.ts";
import { Statement } from "./Statement.ts";
import { evaluateIntegerExpression, Expression, parseNumberFromString } from "../Expressions.ts";
import { Token } from "antlr4ng";
import { getFileAccessor, getSequentialReadAccessor } from "./FileSystem.ts";
import { OpenMode, tryIo } from "../Files.ts";
import { RuntimeError, ILLEGAL_FUNCTION_CALL, OVERFLOW, IOError, BAD_FILE_MODE, FIELD_OVERFLOW } from "../Errors.ts";
import { asciiToString, CR, LF, NUL, TAB, trim } from "../AsciiChart.ts";

export interface InputStatementArgs {
  token: Token;
  prompt?: string;
  mark?: boolean;
  sameLine?: boolean;
  fileNumber?: Expression;
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
    let finished: () => void;
    let cancelled = false;
    const {keyboard, screen, speaker} = context.devices;
    const isWordChar = (char: string) => /[A-Za-z0-9]/.test(char);
    const showCursor = () => {
      screen.configureTextCursor(0, 0, keyboard.getInsertMode());
      screen.showTextCursor();
    };
    const turnOffInsertModeAndResetCursor = () => {
      if (keyboard.getInsertMode()) {
        keyboard.turnOffInsertMode();
        showCursor();
      }
    };
    const move = (dx: number) => {
      screen.moveTextCursor(dx);
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
      showCursor();
    };
    keyboard.turnOffInsertMode();
    prompt();
    // So we can test non-interactively with deno which doesn't have rAF
    const frame = globalThis.requestAnimationFrame ?? setTimeout;
    const editorFrame = () => {
      if (cancelled) {
        return;
      }
      const key = keyboard.input();
      if (!key) {
        frame(editorFrame);
        return;
      }
      switch (key.cursorCommand) {
        case CursorCommand.ENTER:
          keyboard.turnOffInsertMode();
          screen.hideTextCursor();
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
          turnOffInsertModeAndResetCursor();
          if (position > 0) {
            move(-1);
          }
          break;
        case CursorCommand.RIGHT:
          turnOffInsertModeAndResetCursor();
          if (position >= 256) {
            speaker.beep();
          } else {
            if (position >= buffer.length) {
              buffer.push(' ');
              screen.print(' ', false);
            } else {
              screen.moveTextCursor(1);
            }
            position++;
          }
          break;
        case CursorCommand.FORWARD_WORD:
          turnOffInsertModeAndResetCursor();
          while (position < buffer.length && isWordChar(buffer[position])) {
            move(1);
          }
          while (position < buffer.length && !isWordChar(buffer[position])) {
            move(1);
          }
          break;
        case CursorCommand.BACK_WORD:
          turnOffInsertModeAndResetCursor();
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
          turnOffInsertModeAndResetCursor();
          move(-position);
          break;
        case CursorCommand.END:
          turnOffInsertModeAndResetCursor();
          move(buffer.length - position);
          break;
        case CursorCommand.INSERT:
          keyboard.toggleSoftInsertMode();
          showCursor();
          break;
        // @ts-ignore
        case CursorCommand.BACKSPACE:
          if (position > 0) {
            move(-1);
          }
          // fallthrough 
        case CursorCommand.DELETE:
          if (buffer.length > 0 && position < buffer.length) {
            buffer.splice(position, 1);
            screen.print(buffer.slice(position).join('') + ' ', false);
            screen.moveTextCursor(-(buffer.length - position + 1));
          }
          break;
        case CursorCommand.DELETE_TO_END:
          turnOffInsertModeAndResetCursor();
          const numToDelete = buffer.length - position;
          buffer.splice(position, numToDelete);
          screen.print(' '.repeat(numToDelete), false);
          screen.moveTextCursor(-numToDelete);
          break;
        case CursorCommand.DELETE_LINE:
          turnOffInsertModeAndResetCursor();
          screen.moveTextCursor(-position);
          screen.print(' '.repeat(buffer.length), false);
          screen.moveTextCursor(-buffer.length);
          buffer = [];
          position = 0;
          break;
        default: {
          if (!key.char) {
            break;
          }
          const text = key.char === TAB ? ' '.repeat(nextTab() - position) : key.char;
          const insert = keyboard.getInsertMode();
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
            screen.moveTextCursor(-(buffer.length - position));
          } else {
            for (let i = 0; i < text.length; i++) {
              buffer.splice(position++, 1, text[i]);
            }
            screen.print(text, false);
          }
        }
      }
      frame(editorFrame);
    };
    return context.scheduler.schedule({
      start: (resolve) => {
        finished = resolve;
        frame(editorFrame);
      },
      cancel: () => {
        cancelled = true;
      }
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
      while (pos < line.length && ` ${CR}${LF}`.includes(line[pos])) {
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
      return string(trim(line.slice(start, pos)));
    };
    const numericItem = (type: Type) => {
      const start = pos;
      while (pos < line.length && line[pos] != ',') {
        pos++;
      }
      const value = parseNumberFromString(trim(line.slice(start, pos)) || '0');
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
      if (accessor.openMode() === OpenMode.RANDOM) {
        // random access file will return a never-ending stream of nuls and
        // overflow any field we try to read...
        throw new IOError(FIELD_OVERFLOW);
      }
      let char = '';
      const nextChar = () => {
        char = accessor.readChars(1);
      };
      const peekChar = () => {
        const pos = accessor.getSeek();
        const next = accessor.readChars(1);
        accessor.seek(pos);
        return next;
      };
      const skipWhitespaceBeforeField = () => {
        nextChar();  // Note: fails with "input past end of file" if eof
        while (!accessor.eof() && char === ' ') {
          nextChar();
        }
      };
      const skipToNextField = () => {
        // Char is one of " , CR LF sp.
        if (char === ',') {
          return;
        }
        if (char === CR) {
          if (!accessor.eof() && peekChar() === LF) {
            nextChar();
          }
          return;
        }
        if (char === LF) {
          return;
        }
        // char is " or sp.  Consume more spaces up to a comma or newline.
        while (!accessor.eof() && peekChar() === ' ') {
          nextChar();  // Consume ' '
        }
        if (!accessor.eof() && peekChar() === ',') {
          nextChar();  // Consume ','
          return;
        }
        if (!accessor.eof() && peekChar() === CR) {
          nextChar();
          if (!accessor.eof() && peekChar() === LF) {
            nextChar();
          }
          return;
        }
        if (!accessor.eof() && peekChar() === LF) {
          nextChar();
          return;
        }
      };
      const scanQuotedField = () => {
        let result = "";
        if (accessor.eof()) {
          return result;
        }
        nextChar();  // Character after opening '"'.
        while (!accessor.eof() && char !== '"') {
          // Include newlines inside quotes.
          result += char;
          nextChar();
        }
        // Note skipToNextField() will skip just past , if we have a list of
        // strings like "foo"   ,  "bar".  But if we have "foo""bar", it treats
        // the closing quote as the delimiter.
        skipToNextField();
        return result;
      };
      const scanUnquotedField = () => {
        let result = "";
        while (!accessor.eof() && !`,${CR}${LF}`.includes(char)) {
          result += char;
          nextChar();
        }
        skipToNextField();
        return result;
      }
      const scanStringField = () => {
        skipWhitespaceBeforeField();
        return char === '"' ? scanQuotedField() : scanUnquotedField();
      };
      const scanNumberField = () => {
        skipWhitespaceBeforeField();
        let result = "";
        while (!accessor.eof() && !`, ${CR}${LF}`.includes(char)) {
          result += char;
          nextChar();
        }
        skipToNextField();
        return result;
      };
      for (let i = 0; i < this.args.variables.length; i++) {
        const variable = this.args.variables[i];
        if (isString(variable.type)) {
          const field = scanStringField();
          context.memory.write(variable, string(field));
        } else {
          const field = scanNumberField();
          let value = parseNumberFromString(trim(field)) ?? getDefaultValue(variable);
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
    private n: Expression,
    private fileNumber: Expression | undefined,
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
        const accessor = getFileAccessor({
          expr: this.fileNumber!,
          context
        });
        const mode = accessor.openMode();
        if (mode === OpenMode.INPUT || mode === OpenMode.RANDOM) {
          result = accessor.readChars(numBytes);
        } else if (mode === OpenMode.BINARY) {
          result = asciiToString(accessor.getBytes(numBytes));
        } else {
          throw new IOError(BAD_FILE_MODE);
        }
      });
      context.memory.write(this.result, string(result));
      return;
    }
    return {tag: ControlFlowTag.WAIT, promise: this.readStdin(numBytes, context)};
  }

  private readStdin(numBytes: number, context: ExecutionContext): Promise<void> {
    let buffer: string[] = [];
    let finished: () => void;
    let cancelled = false;
    const frame = globalThis.requestAnimationFrame ?? setTimeout;
    const keyWaitFrame = () => {
      if (cancelled) {
        return;
      }
      const key = context.devices.keyboard.input();
      if (!key || key.breakCode) {
        frame(keyWaitFrame);
        return;
      }
      // Non-ASCII make codes like arrow keys read as CHR$(0).
      buffer.push(key.char ?? NUL);
      if (buffer.length >= numBytes) {
        context.memory.write(this.result, string(buffer.join('')));
        finished();
        return;
      }
      frame(keyWaitFrame);
    };
    return context.scheduler.schedule({
      start: (resolve) => {
        finished = resolve;
        frame(keyWaitFrame);
      },
      cancel: () => {
        cancelled = true;
      }
    });
  }
}