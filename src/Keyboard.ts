import { keyToScanCode, scanCodeToKey } from "./ScanCodeChart.ts"

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

export interface Key {
  code: number;
  char?: string;
  cursorCommand?: CursorCommand;
}

interface SoftKey {
  softNumLock: boolean;
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
  location?: number;
  enabled?: boolean;
  state?: boolean; 
}

export class KeyboardListener implements Keyboard {
  inputBuffer: Key[] = [];
  lastScanCode: number = 0;
  macros: Map<string, string> = new Map();
  customKeys: CustomKey[] = [];
  softNumLockState: boolean = false;

  constructor() {
    this.reset();
  }

  reset() {
    this.inputBuffer = [];
    this.lastScanCode = 0;
    this.macros = new Map();
    this.customKeys = defaultCustomKeys();
    this.softNumLockState = false;
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
    (e as unknown as SoftKey).softNumLock = this.softNumLockState;
    if (e.key === 'Clear') {
      // Use the "Clear" key as a software numlock for os x.
      this.softNumLockState = !this.softNumLockState;
    }
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
      // numpad arrows trigger arrow key events even if numlock is turned on.
      const ignoreNumLock = keyNumber >= 11 && keyNumber <= 14;
      const modifiersMatch = (
        !!(customKey.flags & 3) === e.shiftKey &&
        !!(customKey.flags & 4) === e.ctrlKey &&
        !!(customKey.flags & 8) === e.altKey &&
        (!!(customKey.flags & 32) === isNumLockOn(e) || ignoreNumLock) &&
        !!(customKey.flags & 64) === e.getModifierState('CapsLock') &&
        !!(customKey.flags & 128) === isExtendedKey(e, code)
      );
      const locationMatches = customKey.location === undefined ||
        e.location === customKey.location ||
        (customKey.location === 3 && isNumberPad(e));
      const codeMatches = code === customKey.scanCode;
      if (modifiersMatch && locationMatches && codeMatches) {
        return customKey;
      }
    }
  }

  keyup(e: KeyboardEvent) {
    (e as unknown as SoftKey).softNumLock = this.softNumLockState;
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
  const keyLocation = isNumberPad(e) ? 3 : e.location;
  return getScanCodeForKeyName(e.key, keyLocation) ||
    // The default Mac en-US keyboard layout uses option + key to compose common
    // Unicode symbols, which won't show up in the key map.  Fall back to the
    // legacy keyCode property to get just e.g. Q for Alt+Q instead of œ.
    (e.altKey && e.key.length === 1 && !isPrintableAscii(e.key) ?
     getScanCodeForKeyName(String.fromCharCode(e.keyCode), keyLocation) :
     undefined);
}

function getScanCodeForKeyName(name: string, location: number): number | undefined {
  return keyToScanCode.get(`${name}_${location}`.toLowerCase()) ||
    keyToScanCode.get(name.toLowerCase());
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
    if (e.location === 3 && !isNumLockOn(e)) {
      switch (e.key) {
        case '4': return CursorCommand.BACK_WORD;
        case '6': return CursorCommand.FORWARD_WORD;
        case '1': return CursorCommand.DELETE_TO_END;
      }
    }
  }
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
  if (e.location === 3 && !isNumLockOn(e)) {
    switch (e.key) {
      case '4': return CursorCommand.LEFT;
      case '6': return CursorCommand.RIGHT;
      case '7': return CursorCommand.HOME;
      case '1': return CursorCommand.END;
      case '0': return CursorCommand.INSERT;
      case '.': return CursorCommand.DELETE;
    }
  }
}

function isNumLockOn(e: KeyboardEvent) {
  return e.getModifierState('NumLock') || (e as unknown as SoftKey).softNumLock;
}

function isNumberPad(e: KeyboardEvent) {
  // Make the meta key force numpad to make arrows usable for Mac laptops.
  return e.location === 3 || e.metaKey;
}

function keyToChar(e: KeyboardEvent): string | undefined {
  if (e.key.length === 1) {
    if (e.location === 3 && !isNumLockOn(e)) {
      return;
    }
    if (isPrintableAscii(e.key)) {
      return e.key;
    }
  }
  switch (e.key) {
    case 'Enter': return '\x0d';
    case 'Backspace': return '◘';
    case 'Escape': return '←';
    case 'Tab': return '\x09';
  }
}

function defaultCustomKeys(): CustomKey[] {
  const keys: CustomKey[] = new Array(32);
  for (let i = 1; i <= 10; i++) {
    keys[i] = { flags: 0, scanCode: keyToScanCode.get(`F${i}`)! };
  }
  // Arrow key events only match numpad arrows, not extended arrow keys.
  keys[11] = { flags: 0, location: 3, scanCode: keyToScanCode.get('ArrowUp')! };
  keys[12] = { flags: 0, location: 3, scanCode: keyToScanCode.get('ArrowLeft')! };
  keys[13] = { flags: 0, location: 3, scanCode: keyToScanCode.get('ArrowRight')! };
  keys[14] = { flags: 0, location: 3, scanCode: keyToScanCode.get('ArrowDown')! };
  for (let i = 15; i <= 25; i++) {
    keys[i] = { flags: 0, scanCode: 0 };
  }
  keys[30] = { flags: 0, scanCode: keyToScanCode.get(`F11`)! };
  keys[31] = { flags: 0, scanCode: keyToScanCode.get(`F12`)! };
  return keys;
}

function isExtendedKey(e: KeyboardEvent, code: number): boolean {
  // This matches movement keys not on the numpad (not F11/F12).
  return code >= 71 && !isNumberPad(e);
}

function isPrintableAscii(keyName: string): boolean {
  return keyName.charCodeAt(0) >= 32 && keyName.charCodeAt(0) <= 127;
}