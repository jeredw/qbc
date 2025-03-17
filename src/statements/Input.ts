import { ExprContext } from "../../build/QBasicParser.ts";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { CursorCommand } from "../Keyboard.ts";
import { cast, isError, string, Value } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { isString, Type } from "../Types.ts";
import { Statement } from "./Statement.ts";
import { parseNumberFromString } from "../Expressions.ts";
import { Token } from "antlr4ng";
import { getSequentialReadAccessor } from "./FileSystem.ts";
import { tryIo } from "../Files.ts";

export interface InputStatementArgs {
  token: Token;
  prompt?: string;
  mark?: boolean;
  sameLine?: boolean;
  fileNumber?: ExprContext;
  variables: Variable[];
}

abstract class BaseInputStatement extends Statement {
  args: InputStatementArgs;

  constructor(args: InputStatementArgs) {
    super();
    this.args = args;
  }

  override execute(context: ExecutionContext): ControlFlow | void {
    if (this.args.fileNumber) {
      tryIo(this.args.token, () => this.parseLineFromFile(context));
      return;
    }
    return {tag: ControlFlowTag.WAIT, promise: this.lineEditor(context)};
  }

  protected abstract parse(context: ExecutionContext, line: string): [boolean, string];

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
    const {keyboard, textScreen, speaker} = context.devices;
    const isWordChar = (char: string) => /[A-Za-z0-9]/.test(char);
    const toggleInsert = () => {
      insert = !insert;
      textScreen.showCursor(insert);
    };
    const move = (dx: number) => {
      textScreen.moveCursor(dx);
      position += dx;
    };
    const nextTab = () => 8 + 8 * Math.floor(position / 8);
    const prompt = () => {
      if (this.args.prompt) {
        textScreen.print(this.args.prompt, false);
      }
      if (this.args.mark) {
        textScreen.print("? ", false);
      }
      textScreen.showCursor(insert);
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
          textScreen.hideCursor();
          if (!this.args.sameLine) {
            textScreen.print('', true);
          }
          const [success, errorMessage] = this.parse(context, buffer.join(''));
          if (success) {
            finished();
            return;
          }
          textScreen.print('', true);
          if (errorMessage) {
            textScreen.print(errorMessage, true);
          }
          textScreen.print('Redo from start', true);
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
              textScreen.print(' ', false);
            } else {
              textScreen.moveCursor(1);
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
            textScreen.print(buffer.slice(position).join('') + ' ', false);
            textScreen.moveCursor(-(buffer.length - position + 1));
          }
          break;
        case CursorCommand.DELETE_TO_END:
          if (insert) {
            toggleInsert();
          }
          const numToDelete = buffer.length - position;
          buffer.splice(position, numToDelete);
          textScreen.print(' '.repeat(numToDelete), false);
          textScreen.moveCursor(-numToDelete);
          break;
        case CursorCommand.DELETE_LINE:
          if (insert) {
            toggleInsert();
          }
          textScreen.moveCursor(-position);
          textScreen.print(' '.repeat(buffer.length), false);
          textScreen.moveCursor(-buffer.length);
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
            textScreen.print(buffer.slice(position).join(''), false);
            position += text.length;
            textScreen.moveCursor(-(buffer.length - position));
          } else {
            for (let i = 0; i < text.length; i++) {
              buffer.splice(position++, 1, text[i]);
            }
            textScreen.print(text, false);
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

  protected override parse(context: ExecutionContext, line: string): [boolean, string] {
    const result = this.args.variables[0];
    context.memory.write(result, string(line));
    return [true, ''];
  }
}

export class InputStatement extends BaseInputStatement {
  constructor(args: InputStatementArgs) {
    super(args);
  }

  protected override parse(context: ExecutionContext, line: string): [boolean, string] {
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
              throw new Error(data.errorMessage);
            }
            throw new Error();
          }
          items.push(data);
        }
        if (i != this.args.variables.length - 1) {
          separator();
        }
      }
      skipWhitespace();
      if (pos < line.length) {
        throw Error();
      }
    } catch (e: unknown) {
      const message = (e as Error).message;
      return [false, message];
    }
    for (let i = 0; i < this.args.variables.length; i++) {
      const variable = this.args.variables[i];
      const [address, _] = context.memory.dereference(variable);
      context.memory.write(variable, items[i]);
    }
    return [true, ''];
  }
}