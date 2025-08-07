import { Interpreter } from "./Interpreter.ts";
import { DebugState } from "./DebugState.ts";
import { DiskEntry, DiskListener, MemoryDrive } from "./Disk.ts";
import { ParseError, RuntimeError } from "./Errors.ts";
import { CanvasScreen } from "./Screen.ts";
import { LinePrinter } from "./Printer.ts";
import { WebAudioSpeaker } from "./Speaker.ts";
import { Invocation, Invoker } from "./Invocation.ts";
import { KeyboardListener } from "./Keyboard.ts";
import { RealTimeTimer } from "./Timer.ts";
import { GamepadListener } from "./Joystick.ts";
import { PointerListener } from "./LightPen.ts";
import { HttpModem } from "./Modem.ts";
import "monaco-editor/esm/vs/editor/editor.all.js";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { QBasicSymbolTag } from "./SymbolTable.ts";
import { debugPrintValue, debugPrintVariable } from "./Values.ts";
import { asciiToString, stringToAscii, CR, LF, TAB, EOF } from "./AsciiChart.ts";
import { decodeGwBasicBinaryFile } from "./GwBasicFormat.ts";
import { decodeQb45BinaryFile } from "./Qb45Format.ts";
import JSZip from "jszip";
import { MouseListener, MouseSurface } from "./Mouse.ts";
import { SoundBlaster } from "./SoundBlaster.ts";
import type { PlayerElement } from "./midi-player.d.ts";

enum RunState {
  ENDED,
  PAUSED,
  RUNNING
}

interface DebugProvider {
  query(line: number, column: number): string | undefined;
}

class Shell implements DebugProvider, DiskListener, MouseSurface, Invoker {
  private root: HTMLElement;
  private interpreter: Interpreter;
  private invocation: Invocation | null = null;

  private editorPane: HTMLElement;
  private editor: EditorProxy;
  private running: RunState;
  private runFromStartButton: HTMLElement;
  private pauseButton: HTMLElement;
  private resumeButton: HTMLElement;
  private stepButton: HTMLElement;
  private stepOverButton: HTMLElement;
  private importButton: HTMLElement;
  private importInput: HTMLInputElement;
  private filePicker: HTMLElement;
  private catalogChannel: BroadcastChannel;
  private statusBar: StatusBar;

  private screen: CanvasScreen;
  private speaker: WebAudioSpeaker;
  private printer: LinePrinter;
  private disk: MemoryDrive;
  private keyboard: KeyboardListener;
  private timer: RealTimeTimer;
  private gamepad: GamepadListener;
  private pointer: PointerListener;
  private modem: HttpModem;
  private mouse: MouseListener;
  private blaster: SoundBlaster;

  constructor(root: HTMLElement) {
    this.root = root;
    this.screen = new CanvasScreen();
    const midiPlayer = assertHTMLElement(document.querySelector('.midi-player')) as PlayerElement;
    this.speaker = new WebAudioSpeaker(midiPlayer);
    this.printer = new LinePrinter(80);
    this.disk = new MemoryDrive("C", this);
    this.keyboard = new KeyboardListener();
    this.timer = new RealTimeTimer();
    this.gamepad = new GamepadListener();
    this.pointer = new PointerListener(this.screen);
    this.modem = new HttpModem();
    this.mouse = new MouseListener(this);
    this.blaster = new SoundBlaster(this.speaker);
    const outputPane = assertHTMLElement(root.querySelector('.output-pane'));
    outputPane.appendChild(this.screen.canvas);
    this.root.appendChild(this.printer.paperWindow);
    requestAnimationFrame(this.frame);
    this.interpreter = new Interpreter({
      screen: this.screen,
      speaker: this.speaker,
      printer: this.printer,
      disk: this.disk,
      keyboard: this.keyboard,
      timer: this.timer,
      joystick: this.gamepad,
      lightPen: this.pointer,
      modem: this.modem,
      mouse: this.mouse,
      blaster: this.blaster,
    }, this);
    this.statusBar = new StatusBar(assertHTMLElement(root.querySelector('.status-bar')), this.keyboard);
    this.interpreter.debug.blockForIo = (block: boolean) => this.blockDebugForIo(block);
    this.running = RunState.ENDED;
    this.editorPane = assertHTMLElement(root.querySelector('.editor-pane'));
    const editorElement = assertHTMLElement(root.querySelector('.editor'));
    this.editor = new EditorProxy(editorElement, this.interpreter.debug, this);
    this.runFromStartButton = assertHTMLElement(root.querySelector('.run-from-start'));
    this.runFromStartButton.addEventListener('click', () => setTimeout(() => this.run(true)));
    this.pauseButton = assertHTMLElement(root.querySelector('.pause'));
    this.pauseButton.addEventListener('click', () => setTimeout(() => this.pause()));
    this.resumeButton = assertHTMLElement(root.querySelector('.resume'));
    this.resumeButton.addEventListener('click', () => setTimeout(() => this.run(false)));
    this.stepButton = assertHTMLElement(root.querySelector('.step'));
    this.stepButton.addEventListener('click', () => setTimeout(() => this.step()));
    this.stepOverButton = assertHTMLElement(root.querySelector('.step-over'));
    this.stepOverButton.addEventListener('click', () => setTimeout(() => this.stepOver()));
    this.importInput = root.querySelector('.import-input')!;
    this.importInput.addEventListener('input', () => this.importFiles());
    this.importButton = assertHTMLElement(root.querySelector('.import'));
    this.importButton.addEventListener('click', () => this.importInput.click());
    this.filePicker = assertHTMLElement(root.querySelector('.file-picker'));
    document.addEventListener('keydown', (e: KeyboardEvent) => this.keydown(e));
    document.addEventListener('keyup', (e: KeyboardEvent) => this.keyup(e));
    this.screen.canvas.addEventListener('mousedown', (e: MouseEvent) => this.mousedown(e));
    this.screen.canvas.addEventListener('mouseup', (e: MouseEvent) => this.mouseup(e));
    this.screen.canvas.addEventListener('mousemove', (e: MouseEvent) => this.mousemove(e));
    this.screen.canvas.addEventListener('pointerdown', (e: PointerEvent) => this.pointerdown(e));
    this.screen.canvas.addEventListener('pointerup', (e: PointerEvent) => this.pointerup(e));
    this.screen.canvas.addEventListener('pointermove', (e: PointerEvent) => this.pointermove(e));
    this.screen.canvas.addEventListener('fullscreenchange', (e) => this.fullscreenChange());
    this.catalogChannel = new BroadcastChannel('catalog');
    this.catalogChannel.onmessage = (e: MessageEvent) => this.runCatalogCommand(e);
  }

  private mousedown(e: MouseEvent) {
    if (document.activeElement == this.screen.canvas) {
      this.mouse.mousedown(e);
    }
  }

  private mouseup(e: MouseEvent) {
    if (document.activeElement == this.screen.canvas) {
      this.mouse.mouseup(e);
    }
  }

  private mousemove(e: MouseEvent) {
    if (document.activeElement == this.screen.canvas) {
      this.mouse.mousemove(e);
    }
  }

  showMouseCursor(x: number, y: number) {
    this.screen.canvas.style.cursor = 'default';
    // this.screen.showMouseCursor(x, y);
  }

  hideMouseCursor() {
    this.screen.canvas.style.cursor = '';
    // this.screen.hideMouseCursor();
  }

  scaleMouseCoordinates(x: number, y: number): {x: number, y: number} {
    if (document.fullscreenElement) {
      // In fullscreen mode, canvas content will be letterboxed with insets on
      // either the left or top, and (x, y) will be relative to the top/left of
      // the screen. Re-scale so that (x, y) is relative to content instead.
      const {
        offsetWidth: canvasWidth,
        offsetHeight: canvasHeight,
        width: contentWidth,
        height: contentHeight
      } = this.screen.canvas;
      const contentAspectRatio = contentWidth / contentHeight;
      const screenAspectRatio = window.innerWidth / window.innerHeight;

      let usableWidth: number;
      let usableHeight: number;
      let insetLeft = 0;
      let insetTop = 0;
      if (screenAspectRatio > contentAspectRatio) {
        usableHeight = canvasHeight;
        usableWidth = usableHeight * contentAspectRatio;
        insetLeft = (canvasWidth - usableWidth) / 2;
      } else {
        usableWidth = canvasWidth;
        usableHeight = usableWidth / contentAspectRatio;
        insetTop = (canvasHeight - usableHeight) / 2;
      }
      x = (x - insetLeft) * (contentWidth / usableWidth);
      y = (y - insetTop) * (contentHeight / usableHeight);
    } else {
      // There is a 3px border for the focus ring when not in fullscreen mode.
      x -= 3;
      y -= 3;
    }
    return this.screen.scaleMouseCoordinates(x, y);
  }

  private pointerdown(e: PointerEvent) {
    if (document.activeElement == this.screen.canvas) {
      this.pointer.pointerdown(e);
    }
  }

  private pointerup(e: PointerEvent) {
    if (document.activeElement == this.screen.canvas) {
      this.pointer.pointerup(e);
    }
  }

  private pointermove(e: PointerEvent) {
    if (document.activeElement == this.screen.canvas) {
      this.pointer.pointermove(e);
    }
  }

  private toggleFullScreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      this.screen.canvas.requestFullscreen();
    }
  }

  private fullscreenChange() {
    if (document.fullscreenElement) {
      document.body.classList.add('fullscreen');
      this.statusBar.hide();
      this.editorPane.style.display = 'none';
      this.screen.canvas.style.border = 'none';
    } else {
      document.body.classList.remove('fullscreen');
      this.statusBar.show();
      this.editorPane.style.display = '';
      this.screen.canvas.style.border = '';
    }
  }

  private keydown(e: KeyboardEvent): boolean | void {
    if (e.metaKey && e.key === 'Enter') {
      this.toggleFullScreen();
      return false;
    }
    if (document.activeElement == this.screen.canvas) {
      this.keyboard.keydown(e);
      e.preventDefault();
      return false;
    }
    this.editor.clearErrors();
  }

  private keyup(e: KeyboardEvent): boolean | void {
    if (document.activeElement == this.screen.canvas) {
      this.keyboard.keyup(e);
      e.preventDefault();
      return false;
    }
  }

  private async importFiles() {
    for (const file of this.importInput.files ?? []) {
      const buffer = await file.arrayBuffer();
      const fileName = file.name.toUpperCase();
      if (fileName.endsWith('.ZIP')) {
        this.importArchive(buffer);
        continue;
      }
      this.importFile(fileName, buffer);
    }
  }

  private async importArchive(buffer: ArrayBuffer) {
    let zip: JSZip;
    try {
      zip = await new JSZip().loadAsync(buffer);
    } catch (e: unknown) {
      alert('Bad zip file');
      return;
    }
    let hasSourceFile = false;
    for (const file of Object.values(zip.files)) {
      if (file.name.toUpperCase().endsWith('.BAS')) {
        hasSourceFile = true;
      }
    }
    if (!hasSourceFile && !confirm('Archive contains no .BAS files, continue?')) {
      return;
    }
    const path = (name: string): string => '.\\' + name.toUpperCase().replace(/\//g, '\\').replace(/\\$/, '');
    // Some zip files don't have explicit directory objects, so instead go through
    // all the files and create any necessary directories first.
    const directories: Set<string> = new Set();
    for (const file of Object.values(zip.files)) {
      const directory = path(file.name).replace(/\\[^\\]*$/, '');
      for (let i = 0; i <= directory.length; i++) {
        if (i === directory.length || directory[i] == '\\') {
          directories.add(directory.slice(0, i));
        }
      }
    }
    const sortedDirectories: string[] = Array.from(directories.values());
    const depth = (dir: string) => dir.replace(/[^\\]/g, '').length;
    sortedDirectories.sort((a: string, b: string) => depth(a) - depth(b));
    for (const directory of sortedDirectories) {
      try {
        this.disk.makeDirectory(directory);
      } catch (e: unknown) {
      }
    }
    for (const file of Object.values(zip.files)) {
      if (file.dir) {
        continue;
      }
      const buffer = await file.async("arraybuffer");
      this.importFile(path(file.name), buffer);
    }
  }

  private importFile(path: string, buffer: ArrayBuffer) {
    if (path.endsWith('.EXE') || path.endsWith('.BAT')) {
      // Lots of old program archives include qbasic.exe or game scripts, we
      // don't want these.
      return;
    }
    let bytes = Array.from(new Uint8Array(buffer));
    if (path.endsWith('.BAS')) {
       bytes = cleanupNewlines(decodeProgram(buffer));
    }
    this.disk.writeFile(path, {
      name: path,
      isDirectory: false,
      bytes
    });
  }

  updateDiskEntry(entry: DiskEntry) {
    this.refreshFilePicker();
  }

  private refreshFilePicker() {
    const files = this.disk.listFiles('');
    files.sort((a: DiskEntry, b: DiskEntry): number => {
      return a.isDirectory && !b.isDirectory ? -1 :
        !a.isDirectory && b.isDirectory ? 1 :
        a.name < b.name ? -1 : 1;
    });
    const isRoot = this.disk.getCurrentDirectory().endsWith(':\\');
    this.filePicker.innerHTML = '';
    for (const file of files) {
      if (file.name === '.' || isRoot && file.name === '..') {
        continue;
      }
      const item = document.createElement('div');
      item.className = 'file-picker-item';
      if (file.isDirectory) {
        item.innerText = `[${file.name}]`;
        item.addEventListener('click', () => {
          this.disk.changeDirectory(file.name);
          this.refreshFilePicker();
        });
      } else {
        item.innerText = `${file.name}`;
        item.addEventListener('click', () => {
          this.load(file.name)
        });
      }
      this.filePicker.appendChild(item);
    }
  }

  load(fileName: string) {
    const file = this.disk.readFile(fileName);
    const text = asciiToString(file.bytes)
      .replaceAll(CR, '\r')
      .replaceAll(LF, '\n')
      .replaceAll(TAB, '\t')
      .replaceAll(EOF, '\x26');
    this.invocation?.stop();
    this.invocation = null;
    this.interpreter.debug.breakpoints = new Set();
    this.updateStateAfterRunning();
    this.editor.setValue(text);
    this.updatePaperVisibility(text);
  }

  private updateState(state: RunState) {
    this.root.classList.toggle('running', state === RunState.RUNNING);
    this.root.classList.toggle('paused', state === RunState.PAUSED);
    if (state !== RunState.RUNNING) {
      this.screen.hideTextCursor();
    }
    if (state === RunState.PAUSED) {
      if (this.invocation) {
        this.interpreter.debug.pauseLine = this.invocation.nextLine;
        this.editor.updateDecorations();
        this.editor.scrollToLine(this.invocation.nextLine);
      }
    }
    this.running = state;
  }

  private updateStateAfterRunning() {
    if (!this.invocation || this.invocation?.isAtEnd()) {
      this.updateState(RunState.ENDED);
      this.interpreter.debug.pauseLine = undefined;
      this.editor.updateDecorations();
    } else if (this.invocation?.isStopped()) {
      this.updateState(RunState.PAUSED);
    }
  }

  runProgram(fileName: string) {
    const program = (
      fileName.includes('.') || fileName.toLowerCase().endsWith('.bas') ? fileName : `${fileName}.bas`
    );
    this.load(program);
    setTimeout(() => {
      this.run(true);
    });
  }

  restartProgram(statementIndex?: number) {
    setTimeout(() => {
      this.run(true, statementIndex ?? 0);
    });
  }

  private updatePaperVisibility(text: string) {
    if (text.toLowerCase().includes('lprint')) {
      this.printer.show();
    } else {
      this.printer.hide();
    }
  }

  async run(restart = false, statementIndex = 0) {
    this.root.classList.remove('blocked');
    this.updateState(RunState.RUNNING);
    this.interpreter.debug.pauseLine = undefined;
    this.editor.updateDecorations();
    this.editor.clearErrors();
    const text = this.editor.getValue();
    this.updatePaperVisibility(text);
    try {
      this.screen.canvas.focus();
      // The QBasic IDE keeps key bindings around even if you start a new
      // program, but it is more convenient to reset everything on a fresh run.
      if (restart) {
        this.keyboard.reset();
        this.speaker.reset();
        this.screen.reset();
        this.modem.reset();
        this.disk.resetHandles();
        this.invocation?.stop();
        this.invocation = this.interpreter.run(text);
        await this.invocation.restart(statementIndex);
      } else {
        await this.invocation?.start();
      }
    } catch (error: unknown) {
      if (error instanceof ParseError || error instanceof RuntimeError) {
        this.showErrorMessage(error);
      } else {
        throw error;
      }
    } finally {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
      this.updateStateAfterRunning();
    }
  }

  private blockDebugForIo(block: boolean) {
    this.root.classList.toggle('blocked', block);
  }

  pause() {
    if (this.root.classList.contains('blocked')) {
      return;
    }
    // Don't keep playing beeps and boops while we're stepping...
    this.speaker.reset();
    this.invocation?.stop();
    this.updateState(RunState.PAUSED);
  }

  async step() {
    if (this.running !== RunState.PAUSED) {
      return;
    }
    this.updateState(RunState.RUNNING);
    await this.invocation?.stepOneLine();
    this.updateStateAfterRunning();
  }

  async stepOver() {
    if (this.running !== RunState.PAUSED) {
      return;
    }
    this.updateState(RunState.RUNNING);
    await this.invocation?.stepOver();
    this.updateStateAfterRunning();
  }

  private async runCatalogCommand(e: MessageEvent) {
    try {
      const message = JSON.parse(e.data);
      if (message['command'] === 'run') {
        const archivePath: string = message['archive'];
        const program: string = message['program'];
        const response = await fetch(archivePath);
        if (!response.ok) {
          throw new Error('bad response');
        }
        const archive = await response.arrayBuffer();
        await this.importArchive(archive);
        this.load(program);
        void this.run(true);
        return;
      }
    } catch (e: unknown) {
    }
  }

  playAudio() {
    this.speaker.enable();
    this.printer.enableAudio();
    this.root.classList.add('sound-enabled');
  }

  muteAudio() {
    this.speaker.disable();
    this.printer.disableAudio();
    this.root.classList.remove('sound-enabled');
  }

  query(line: number, column: number): string | undefined {
    if (!this.invocation) {
      return;
    }
    const debugInfo = this.invocation.debugInfo();
    for (const {token, symbol} of debugInfo.refs) {
      if (token.line === line && column >= token.column && column <= (token.column + (token.text?.length || 1))) {
        switch (symbol.tag) {
          case QBasicSymbolTag.VARIABLE:
            return debugPrintVariable(symbol.variable);
          case QBasicSymbolTag.CONSTANT:
            return debugPrintValue(symbol.constant.value);
        }
      }
    }
  }

  private frame = (timestamp: number) => {
    this.screen.render();
    this.printer.render(timestamp);
    if (this.invocation && !this.invocation.isStopped()) {
      this.invocation.tick();
    }
    this.speaker.tick();
    this.gamepad.update();
    this.statusBar.update();
    requestAnimationFrame(this.frame);
  }

  private showErrorMessage(error: ParseError | RuntimeError) {
    const {line, column, length} = error.location;
    if (length) {
      this.editor.markError(line, column, length, error.message);
    }
    console.error(line, column, length, error.message);
    this.editor.scrollToLine(line);
  }
}

class EditorProxy {
  private editor: monaco.editor.IStandaloneCodeEditor;
  private decorations: monaco.editor.IEditorDecorationsCollection;
  private hoverLine?: number;
  private justClearedBreakpoint?: number;

  constructor(container: HTMLElement, private debug: DebugState, private debugProvider: DebugProvider) {
    monaco.editor.defineTheme("dos-edit", {
      base: "vs-dark",
      inherit: false,
      rules: [],
      colors: {
        "editor.background": "#0000aa",
        "editor.foreground": "#aaaaaa",
      }
    });
    monaco.languages.register({id: "qbasic"});
    monaco.languages.registerHoverProvider("qbasic", this);
    this.editor = monaco.editor.create(container, {
      theme: "dos-edit",
      fontFamily: "Web IBM VGA 8x16",
      fontSize: 16,
      language: "qbasic",
      glyphMargin: true,
      automaticLayout: true,
    });
    this.decorations = this.editor.createDecorationsCollection([]);
    this.listenForBreakpoints();
  }

  provideHover = (model: monaco.editor.ITextModel, position: monaco.Position): monaco.languages.ProviderResult<monaco.languages.Hover> => {
    const value = this.debugProvider.query(position.lineNumber, position.column);
    if (value) {
      return { contents: [{ value }] };
    }
  }

  setValue(text: string) {
    this.editor.setValue(text);
  }

  getValue(): string {
    return this.editor.getValue();
  }

  clearErrors() {
    monaco.editor.setModelMarkers(this.editor.getModel()!, 'errors', []);
  }

  markError(line: number, column: number, length: number, message: string) {
    monaco.editor.setModelMarkers(this.editor.getModel()!, 'errors', [{
      message,
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: line,
      startColumn: column + 1,
      endLineNumber: line,
      endColumn: column + 1 + length,
    }]);
  }

  scrollToLine(line: number) {
    this.editor.revealLine(line);
  }

  updateDecorations() {
    let newDecorations: monaco.editor.IModelDeltaDecoration[] = [];
    for (const line of this.debug.breakpoints) {
      newDecorations.push({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          className: 'breakpoint-line',
          glyphMarginClassName: 'breakpoint-icon',
        }
      });
    }
    if (this.hoverLine !== undefined) {
      newDecorations.push({
        range: new monaco.Range(this.hoverLine, 1, this.hoverLine, 1),
        options: {
          isWholeLine: true,
          className: 'hover-breakpoint-line',
          glyphMarginClassName: 'hover-breakpoint-icon',
        }
      });
    }
    if (this.debug.pauseLine !== undefined) {
      newDecorations.push({
        range: new monaco.Range(this.debug.pauseLine, 1, this.debug.pauseLine, 1),
        options: {
          isWholeLine: true,
          className: 'pause-line',
        }
      });
    }
    this.decorations.set(newDecorations);
  }

  private listenForBreakpoints() {
    const unhover = () => {
      this.hoverLine = undefined;
      this.updateDecorations();
    };
    const marginHandler = (e: monaco.editor.IEditorMouseEvent, action: (lineNumber: number) => void) => {
      if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        unhover();
        return;
      }
      const data = e.target.detail as monaco.editor.IMouseTargetMarginData;
      if (data.isAfterLines) {
        unhover();
        return;
      }
      action(e.target.position.lineNumber);
      this.updateDecorations();
    };
    const clearBreakpoint = (line: number) => {
      if (this.debug.breakpoints.has(line)) {
        this.debug.breakpoints.delete(line);
        this.justClearedBreakpoint = line;
      }
    };
    const setBreakpoint = (line: number) => {
      if (this.justClearedBreakpoint !== line) {
        this.debug.breakpoints.add(line);
      }
      this.justClearedBreakpoint = undefined;
    };
    const hoverBreakpoint = (line: number) => {
      if (this.debug.breakpoints.has(line)) {
        this.hoverLine = undefined;
        return;
      }
      this.hoverLine = line;
    };
    this.editor.onMouseDown((e: monaco.editor.IEditorMouseEvent) => marginHandler(e, clearBreakpoint));
    this.editor.onMouseUp((e: monaco.editor.IEditorMouseEvent) => marginHandler(e, setBreakpoint));
    this.editor.onMouseMove((e: monaco.editor.IEditorMouseEvent) => marginHandler(e, hoverBreakpoint));
    this.editor.onMouseLeave(() => unhover());
  }
}

class StatusBar {
  capsLock: HTMLElement;
  scrollLock: HTMLElement;
  numLock: HTMLElement;
  insertMode: HTMLElement;
  speedSpinner: HTMLInputElement;

  constructor(
    private root: HTMLElement,
    private keyboard: KeyboardListener,
  ) {
    this.capsLock = assertHTMLElement(root.querySelector('.status-caps'));
    this.scrollLock = assertHTMLElement(root.querySelector('.status-scroll'));
    this.scrollLock.addEventListener('click', () => keyboard.toggleSoftScrollLock());
    this.numLock = assertHTMLElement(root.querySelector('.status-num'));
    this.numLock.addEventListener('click', () => keyboard.toggleSoftNumLock());
    this.insertMode = assertHTMLElement(root.querySelector('.status-insert'));
    this.insertMode.addEventListener('click', () => keyboard.toggleSoftInsertMode());
    this.speedSpinner = assertHTMLElement(root.querySelector('.speed-spinner')) as HTMLInputElement;
    this.speedSpinner.addEventListener('input', (e) => {
      Invocation.ReleaseUiThreadMs = +this.speedSpinner.value / 10;
    });
  }

  hide() {
    this.root.style.display = 'none';
  }

  show() {
    this.root.style.display = '';
  }

  update() {
    const shift = this.keyboard.getShiftStatus();
    this.insertMode.classList.toggle('key-on', !!(shift & 0x80));
    this.capsLock.classList.toggle('key-on', !!(shift & 0x40));
    this.numLock.classList.toggle('key-on', !!(shift & 0x20));
    this.scrollLock.classList.toggle('key-on', !!(shift & 0x10));
  }
}

function cleanupNewlines(file: number[]) {
  // Strip adjacent CRs since lots of programs have weird spacing like 0d 0d 0d 0a.
  return file.filter((x, index) => x !== 13 || x !== file[index + 1]);
}

function decodeProgram(buffer: ArrayBuffer): number[] {
  try {
    // Throws if the input is not a QB45 binary file.
    return decodeQb45BinaryFile(buffer);
  } catch (e: unknown) {
  }
  try {
    // Throws if the input is not a GW-BASIC binary file.
    return decodeGwBasicBinaryFile(buffer);
  } catch (e: unknown) {
  }

  // Assume the program is a plaintext program.
  try {
    // If the program is valid UTF-8, assume that any CP437 characters have
    // already been translated to UTF-8 and translate them back to CP437.
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const text = decoder.decode(buffer);
    return stringToAscii(text);
  } catch (e: unknown) {
  }
  // Otherwise treat the program as a CP437 string.
  return Array.from(new Uint8Array(buffer));
}

function assertHTMLElement(element: Element | null): HTMLElement {
  if (!(element instanceof HTMLElement)) {
    throw new Error("expecting element");
  }
  return element;
}

document.addEventListener("DOMContentLoaded", () => {
  const shell = new Shell(assertHTMLElement(document.querySelector('.shell')));
});