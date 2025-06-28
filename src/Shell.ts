import { Interpreter } from "./Interpreter.ts";
import { MemoryDrive } from "./Disk.ts";
import { ParseError, RuntimeError } from "./Errors.ts";
import { CanvasScreen } from "./Screen.ts";
import { LinePrinter } from "./Printer.ts";
import { WebAudioSpeaker } from "./Speaker.ts";
import { Invocation } from "./Invocation.ts";
import { KeyboardListener } from "./Keyboard.ts";
import { RealTimeTimer } from "./Timer.ts";
import { GamepadListener } from "./Joystick.ts";
import { PointerListener } from "./LightPen.ts";
import { HttpModem } from "./Modem.ts";
import "monaco-editor/esm/vs/editor/editor.all.js";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";

class DebugState {
  breakpoints: Set<number> = new Set();
  pauseLine?: number;
}

enum RunState {
  ENDED,
  PAUSED,
  RUNNING
}

class Shell {
  private root: HTMLElement;
  private interpreter: Interpreter;
  private invocation: Invocation | null = null;

  private editor: EditorProxy;
  private debug: DebugState;
  private running: RunState;
  private runFromStartButton: HTMLElement;
  private pauseButton: HTMLElement;
  private resumeButton: HTMLElement;
  private stepButton: HTMLElement;
  private stepOverButton: HTMLElement;

  private screen: CanvasScreen;
  private speaker: WebAudioSpeaker;
  private printer: LinePrinter;
  private disk: MemoryDrive;
  private keyboard: KeyboardListener;
  private timer: RealTimeTimer;
  private gamepad: GamepadListener;
  private pointer: PointerListener;
  private modem: HttpModem;

  constructor(root: HTMLElement) {
    this.root = root;
    this.screen = new CanvasScreen();
    this.speaker = new WebAudioSpeaker();
    this.printer = new LinePrinter(80);
    this.disk = new MemoryDrive();
    this.keyboard = new KeyboardListener();
    this.timer = new RealTimeTimer();
    this.gamepad = new GamepadListener();
    this.pointer = new PointerListener(this.screen);
    this.modem = new HttpModem();
    this.root.appendChild(this.screen.canvas);
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
    });
    this.debug = new DebugState();
    this.running = RunState.ENDED;
    const editorElement = assertHTMLElement(root.querySelector('.editor'));
    this.editor = new EditorProxy(editorElement, this.debug);
    this.runFromStartButton = assertHTMLElement(root.querySelector('.run-from-start'));
    this.runFromStartButton.addEventListener('click', () => setTimeout(() => this.runFromStart()));
    this.pauseButton = assertHTMLElement(root.querySelector('.pause'));
    this.pauseButton.addEventListener('click', () => setTimeout(() => this.pause()));
    this.resumeButton = assertHTMLElement(root.querySelector('.resume'));
    this.resumeButton.addEventListener('click', () => setTimeout(() => this.resume()));
    this.stepButton = assertHTMLElement(root.querySelector('.step'));
    this.stepButton.addEventListener('click', () => setTimeout(() => this.step()));
    this.stepOverButton = assertHTMLElement(root.querySelector('.step-over'));
    document.addEventListener('keydown', (e: KeyboardEvent) => this.keydown(e));
    document.addEventListener('keyup', (e: KeyboardEvent) => this.keyup(e));
    this.screen.canvas.addEventListener('pointerdown', (e: PointerEvent) => this.pointerdown(e));
    this.screen.canvas.addEventListener('pointerup', (e: PointerEvent) => this.pointerup(e));
    this.screen.canvas.addEventListener('pointermove', (e: PointerEvent) => this.pointermove(e));
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

  private keydown(e: KeyboardEvent): boolean | void {
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

  private updateState(state: RunState) {
    this.root.classList.toggle('running', state === RunState.RUNNING);
    this.root.classList.toggle('paused', state === RunState.PAUSED);
    if (state !== RunState.RUNNING) {
      this.screen.hideCursor();
    }
    this.running = state;
  }

  async runFromStart() {
    this.updateState(RunState.RUNNING);
    this.editor.updateDecorations();
    this.editor.clearErrors();
    const text = this.editor.getValue();
    if (text.toLowerCase().includes('lprint')) {
      this.printer.show();
    } else {
      this.printer.hide();
    }
    try {
      this.screen.canvas.focus();
      // The QBasic IDE keeps key bindings around even if you start a new
      // program, but it is more convenient to reset everything on a fresh run.
      this.keyboard.reset();
      this.speaker.reset();
      this.screen.reset();
      this.modem.reset();
      this.invocation = this.interpreter.run(text);
      await this.invocation.restart();
    } catch (error: unknown) {
      if (error instanceof ParseError || error instanceof RuntimeError) {
        this.showErrorMessage(error);
      } else {
        throw error;
      }
    } finally {
      if (this.invocation?.isAtEnd()) {
        this.updateState(RunState.ENDED);
      }
    }
  }

  pause() {
    this.updateState(RunState.PAUSED);
    this.invocation?.stop();
    if (this.invocation?.line) {
      this.debug.pauseLine = this.invocation.line;
      this.editor.updateDecorations();
      this.editor.scrollToLine(this.invocation.line);
    }
  }

  async resume() {
    if (!this.invocation) {
      return;
    }
    this.updateState(RunState.RUNNING);
    this.debug.pauseLine = undefined;
    this.editor.updateDecorations();
    this.editor.clearErrors();
    this.screen.canvas.focus();
    await this.invocation.start();
    if (this.invocation.isAtEnd()) {
      this.updateState(RunState.ENDED);
    }
  }

  async step() {
    if (this.running !== RunState.PAUSED) {
      return;
    }
    await this.invocation?.stepOneLine();
    if (this.invocation?.line) {
      this.debug.pauseLine = this.invocation.line;
      this.editor.scrollToLine(this.invocation.line);
      this.editor.updateDecorations();
    }
    if (this.invocation?.isAtEnd()) {
      this.updateState(RunState.ENDED);
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

  private frame = (timestamp: number) => {
    this.screen.render();
    this.printer.render(timestamp);
    if (this.invocation && !this.invocation.isStopped()) {
      this.invocation.tick();
    }
    this.speaker.tick();
    this.gamepad.update();
    requestAnimationFrame(this.frame);
  }

  private showErrorMessage(error: ParseError | RuntimeError) {
    const {line, column, length} = error.location;
    if (length) {
      this.editor.markError(line, column, length, error.message);
    }
    console.error(line, column, length, error.message);
  }
}

class EditorProxy {
  private editor: monaco.editor.IStandaloneCodeEditor;
  private decorations: monaco.editor.IEditorDecorationsCollection;
  private hoverLine?: number;
  private justClearedBreakpoint?: number;

  constructor(container: HTMLElement, private debug: DebugState) {
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
    /*monaco.languages.registerHoverProvider("qbasic", {
      provideHover: function(model, position): monaco.languages.ProviderResult<monaco.languages.Hover> {
        console.log(model.getWordAtPosition(position));
        return {contents: [{value: "foo"}]};
      }
    });*/
    this.editor = monaco.editor.create(container, {
      theme: "dos-edit",
      fontFamily: "Web IBM VGA 8x16",
      fontSize: 16,
      language: "qbasic",
      glyphMargin: true,
    });
    this.decorations = this.editor.createDecorationsCollection([]);
    this.listenForBreakpoints();
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

function assertHTMLElement(element: Element | null): HTMLElement {
  if (!(element instanceof HTMLElement)) {
    throw new Error("expecting element");
  }
  return element;
}

document.addEventListener("DOMContentLoaded", () => {
  const shell = new Shell(assertHTMLElement(document.querySelector('.shell')));
});