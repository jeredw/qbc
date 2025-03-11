import { keyToScanCode } from "./ScanCodeChart.ts"

export interface Key {
  code: number;
  char?: string;
  cursorCommand?: CursorCommand;
}

export interface Keyboard {
  input(): Key | undefined;
  getLastScanCode(): number;
}

export function typeLines(lines: string[], listener: KeyboardListener) {
  const fakeKey = (key: string) => ({key} as unknown as KeyboardEvent);
  for (const line of lines) {
    for (const key of line) {
      listener.keydown(fakeKey(key));
      listener.keyup(fakeKey(key));
    }
    listener.keydown(fakeKey('Enter'));
    listener.keyup(fakeKey('Enter'));
  }
}

export class KeyboardListener implements Keyboard {
  inputBuffer: Key[] = [];
  lastScanCode: number = 0;

  reset() {
    this.inputBuffer = [];
    this.lastScanCode = 0;
  }

  input(): Key | undefined {
    return this.inputBuffer.shift();
  }

  keydown(e: KeyboardEvent) {
    const code = getScanCode(e);
    if (code !== undefined) {
      const char = keyToChar(e);
      const cursorCommand = decodeCursorCommand(e);
      this.inputBuffer.push({code, char, cursorCommand});
      this.lastScanCode = code;
    }
  }

  keyup(e: KeyboardEvent) {
    const code = getScanCode(e);
    if (code !== undefined) {
      this.inputBuffer.push({code: 0x80 | code});
      this.lastScanCode = 0x80 | code;
    }
  }

  getLastScanCode(): number {
    return this.lastScanCode;
  }
}

function getScanCode(e: KeyboardEvent): number | undefined {
  return keyToScanCode.get(`${e.key}_${e.location}`.toLowerCase()) ||
    keyToScanCode.get(e.key.toLowerCase());
}

export enum CursorCommand {
  LEFT,
  RIGHT,
  FORWARD_WORD,
  BACK_WORD,
  HOME,
  END,
  INSERT,
  TAB,
  DELETE,
  BACKSPACE,
  DELETE_TO_END,
  DELETE_LINE,
  ENTER,
  TOGGLE_KEY_LIST,
  BREAK
};

function decodeCursorCommand(e: KeyboardEvent): CursorCommand | undefined {
  switch (e.key) {
    case 'ArrowLeft': return CursorCommand.LEFT;
    case 'ArrowRight': return CursorCommand.RIGHT;
    case 'Home': return CursorCommand.HOME;
    case 'End': return CursorCommand.END;
    case 'Insert': return CursorCommand.INSERT;
    case 'Tab': return CursorCommand.TAB;
    case 'Delete': return CursorCommand.DELETE;
    case 'Backspace': return CursorCommand.BACKSPACE;
    case 'Escape': return CursorCommand.DELETE_LINE;
    case 'Enter': return CursorCommand.ENTER;
  }
  if (e.ctrlKey) {
    switch (e.key.toLowerCase()) {
      case '\\': return CursorCommand.RIGHT;
      case ']': return CursorCommand.LEFT;
      case 'f': return CursorCommand.FORWARD_WORD;
      case 'arrowright': return CursorCommand.FORWARD_WORD;
      case 'b': return CursorCommand.BACK_WORD;
      case 'arrowleft': return CursorCommand.BACK_WORD;
      case 'k': return CursorCommand.HOME;
      case 'n': return CursorCommand.END;
      case 'r': return CursorCommand.INSERT;
      case 'i': return CursorCommand.TAB;
      case 'h': return CursorCommand.BACKSPACE;
      case 'e': return CursorCommand.DELETE_TO_END;
      case 'end': return CursorCommand.DELETE_TO_END;
      case 'u': return CursorCommand.DELETE_LINE;
      case 'm': return CursorCommand.ENTER;
      case 't': return CursorCommand.TOGGLE_KEY_LIST;
      case 'break': return CursorCommand.BREAK;
      case 'c': return CursorCommand.BREAK;
    }
  }
}

function keyToChar(e: KeyboardEvent): string | undefined {
  if (e.key.length === 1) return e.key;
  switch (e.key) {
    case 'Enter': return '\x0d';
    case 'Backspace': return '\x08';
    case 'Escape': return '\x27';
    case 'Tab': return '\x09';
  }
}