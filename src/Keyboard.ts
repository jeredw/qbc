import { isExtendedKey, keyToScanCode, scanCodeToKey } from "./ScanCodeChart.ts"

export interface Key {
  code: number;
  char?: string;
  cursorCommand?: CursorCommand;
}

export interface Keyboard {
  input(): Key | undefined;
  numKeysPending(): number;
  getLastScanCode(): number;
  setMacro(functionKey: number, text: string): void;
  getMacro(functionKey: number): string;
  mapKey(flags: number, scanCode: number, keyNumber: number): void;
  monitorKey(keyNumber: number, enable: boolean): void;
  checkKey(keyNumber: number): boolean;
  testKey?(keyNumber: number): void;
}

export function typeLines(lines: string[], listener: KeyboardListener) {
  for (const line of lines) {
    const keys = line.match(/⟨([^⟩]+)⟩|./g) || [];
    for (const key of keys) {
      let name = key.startsWith('⟨') ? key.slice(1, -1) : key;
      let ctrlKey: boolean | undefined;
      if (name.length > 1 && name.toLowerCase().startsWith('ctrl+')) {
        ctrlKey = true;
        name = name.slice(5);
      }
      listener.keydown(fakeKey(name, ctrlKey));
      listener.keyup(fakeKey(name, ctrlKey));
    }
    listener.keydown(fakeKey('Enter'));
    listener.keyup(fakeKey('Enter'));
  }
}

function fakeKey(key: string, ctrlKey?: boolean): KeyboardEvent {
  return {
    key,
    ctrlKey: !!ctrlKey,
    shiftKey: false,
    altKey: false,
    getModifierState: () => false,
  } as unknown as KeyboardEvent;
}

interface CustomKey {
  flags: number;
  scanCode: number;
  enabled?: boolean;
  state?: boolean; 
}

export class KeyboardListener implements Keyboard {
  inputBuffer: Key[] = [];
  lastScanCode: number = 0;
  macros: Map<string, string> = new Map();
  customKeys: CustomKey[] = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.inputBuffer = [];
    this.lastScanCode = 0;
    this.macros = new Map();
    this.customKeys = defaultCustomKeys();
  }

  input(): Key | undefined {
    return this.inputBuffer.shift();
  }

  numKeysPending(): number {
    return this.inputBuffer.length;
  }

  monitorKey(keyNumber: number, enabled: boolean) {
    const key = this.getCustomKey(keyNumber);
    key.enabled = enabled;
    if (!enabled) {
      key.state = false;
    }
  }

  checkKey(keyNumber: number) {
    const key = this.getCustomKey(keyNumber);
    const state = !!key.state;
    key.state = false;
    return state;
  }

  testKey(keyNumber: number) {
    const key = this.getCustomKey(keyNumber);
    if (key) {
      const keyName = scanCodeToKey.get(key.scanCode);
      if (!keyName) {
        throw new Error(`unmapped key ${keyName}`);
      }
      this.keydown(fakeKey(keyName));
    }
  }

  keydown(e: KeyboardEvent) {
    const code = getScanCode(e);
    const customKey = this.detectCustomKey(e, code || 0);
    if (customKey !== undefined) {
      if (customKey.enabled) {
        // Consume the key immediately and don't enqueue it.  For example, if
        // you press F1 during INPUT x$ with KEY(1) ON, the ON KEY(1) handler
        // runs immediately after the input statement (and no KEY 1 macro
        // happens).
        customKey.state = true;
        return;
      }
    }
    const macro = this.macros.get(e.key);
    if (macro) {
      const keys = macro.split('').map((char) => ({code: 0, char}));
      this.inputBuffer.push(...keys);
    } else if (code !== undefined) {
      const char = keyToChar(e);
      const cursorCommand = decodeCursorCommand(e);
      this.inputBuffer.push({code, char, cursorCommand});
      this.lastScanCode = code;
    }
  }

  private detectCustomKey(e: KeyboardEvent, code: number): CustomKey | undefined {
    for (let keyNumber = 1; keyNumber < 32; keyNumber++) {
      // Lower numbered keys take precedence over higher numbered keys.
      // So if we map F1 as KEY 15, CHR$(0) + CHR$(59) and have both KEY(15) ON
      // and KEY(1) ON, KEY(1) will happen but not KEY(15).
      const customKey = this.customKeys[keyNumber];
      if (!customKey) {
        continue;
      }
      const modifiersMatch = (
        !!(customKey.flags & 3) === e.shiftKey &&
        !!(customKey.flags & 4) === e.ctrlKey &&
        !!(customKey.flags & 8) === e.altKey &&
        !!(customKey.flags & 32) === e.getModifierState('NumLock') &&
        !!(customKey.flags & 64) === e.getModifierState('CapsLock') &&
        !!(customKey.flags & 128) === isExtendedKey(code)
      );
      const codeMatches = code === customKey.scanCode;
      if (modifiersMatch && codeMatches) {
        return customKey;
      }
    }
  }

  keyup(e: KeyboardEvent) {
    const code = getScanCode(e);
    const keyNumber = this.detectCustomKey(e, code || 0);
    if (keyNumber !== undefined) {
      // Skip keyup for monitored keys.
      return;
    }
    if (this.macros.has(e.key)) {
      // Skip this event.
    } else if (code !== undefined) {
      this.inputBuffer.push({code: 0x80 | code});
      this.lastScanCode = 0x80 | code;
    }
  }

  getLastScanCode(): number {
    return this.lastScanCode;
  }

  setMacro(functionKey: number, text: string) {
    this.macros.set(`F${functionKey}`, text);
  }

  getMacro(functionKey: number): string {
    return this.macros.get(`F${functionKey}`) ?? '';
  }

  mapKey(flags: number, scanCode: number, keyNumber: number) {
    const key = this.getCustomKey(keyNumber);
    key.flags = flags;
    key.scanCode = scanCode;
  }

  private getCustomKey(keyNumber: number): CustomKey {
    const key = this.customKeys[keyNumber];
    if (!key) {
      throw new Error(`bad key number ${keyNumber}`);
    }
    return key;
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

function defaultCustomKeys(): CustomKey[] {
  const keys: CustomKey[] = new Array(32);
  for (let i = 1; i <= 10; i++) {
    keys[i] = { flags: 0, scanCode: keyToScanCode.get(`F${i}`)! };
  }
  // numpad arrow keys 11-14 are intentionally left unmapped.
  for (let i = 11; i <= 25; i++) {
    keys[i] = { flags: 0, scanCode: 0 };
  }
  keys[30] = { flags: 0, scanCode: keyToScanCode.get(`F11`)! };
  keys[31] = { flags: 0, scanCode: keyToScanCode.get(`F12`)! };
  return keys;
}