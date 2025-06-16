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

class Shell {
  private root: HTMLElement;
  private interpreter: Interpreter;
  private invocation: Invocation | null = null;

  private codeEditor: monaco.editor.IStandaloneCodeEditor;

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
    const editorElement = assertHTMLElement(root.querySelector('.editor'));
    this.codeEditor = initEditor(editorElement);
    this.listenForBreakpoints();
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
    switch (e.key) {
      case 'Enter':
        if (e.altKey || e.metaKey) {
          if (!this.invocation || this.invocation.isStopped()) {
            setTimeout(() => this.run());
          } else {
            setTimeout(() => this.stop());
          }
          e.preventDefault();
          return false;
        }
    }
    this.clearErrors();
  }

  private keyup(e: KeyboardEvent): boolean | void {
    if (document.activeElement == this.screen.canvas) {
      this.keyboard.keyup(e);
      e.preventDefault();
      return false;
    }
  }

  async run() {
    this.clearErrors();
    const text = this.codeEditor.getValue();
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
      this.root.classList.add('running');
      await this.invocation.restart();
    } catch (error: unknown) {
      if (error instanceof ParseError || error instanceof RuntimeError) {
        this.showErrorMessage(error);
      } else {
        throw error;
      }
    } finally {
      this.root.classList.remove('running');
      this.screen.hideCursor();
    }
  }

  step() {
    this.invocation?.step();
  }

  stop() {
    this.root.classList.remove('running');
    this.invocation?.stop();
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

  private clearErrors() {
    monaco.editor.setModelMarkers(this.codeEditor.getModel()!, 'errors', []);
  }

  private markError(line: number, column: number, length: number, message: string) {
    monaco.editor.setModelMarkers(this.codeEditor.getModel()!, 'errors', [{
      message,
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: line,
      startColumn: column + 1,
      endLineNumber: line,
      endColumn: column + 1 + length,
    }]);
  }

  private showErrorMessage(error: ParseError | RuntimeError) {
    const {line, column, length} = error.location;
    if (length) {
      this.markError(line, column, length, error.message);
    }
    console.error(line, column, length, error.message);
  }

  private breakpoints: Set<number> = new Set();

  private listenForBreakpoints() {
    let hoverLine: number | undefined;
    let justCleared: number | undefined;
    const decorations = this.codeEditor.createDecorationsCollection([]);
    const updateModel = () => {
      let newDecorations: monaco.editor.IModelDeltaDecoration[] = [];
      for (const line of this.breakpoints) {
        newDecorations.push({
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: true,
            className: 'breakpoint-line',
            glyphMarginClassName: 'breakpoint-icon',
          }
        });
      }
      if (hoverLine !== undefined) {
        newDecorations.push({
          range: new monaco.Range(hoverLine, 1, hoverLine, 1),
          options: {
            isWholeLine: true,
            className: 'hover-breakpoint-line',
            glyphMarginClassName: 'hover-breakpoint-icon',
          }
        });
      }
      decorations.set(newDecorations);
    };
    const unhover = () => {
      hoverLine = undefined;
      updateModel();
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
      updateModel();
    };
    const clearBreakpoint = (line: number) => {
      if (this.breakpoints.has(line)) {
        this.breakpoints.delete(line);
        justCleared = line;
      }
    };
    const setBreakpoint = (line: number) => {
      if (justCleared !== line) {
        this.breakpoints.add(line);
      }
      justCleared = undefined;
    };
    const hoverBreakpoint = (line: number) => {
      if (this.breakpoints.has(line)) {
        hoverLine = undefined;
        return;
      }
      hoverLine = line;
    };
    this.codeEditor.onMouseDown((e) => marginHandler(e, clearBreakpoint));
    this.codeEditor.onMouseUp((e) => marginHandler(e, setBreakpoint));
    this.codeEditor.onMouseMove((e) => marginHandler(e, hoverBreakpoint));
    this.codeEditor.onMouseLeave(() => unhover());
  }
}

function assertHTMLElement(element: Element | null): HTMLElement {
  if (!(element instanceof HTMLElement)) {
    throw new Error("expecting element");
  }
  return element;
}

function initEditor(editorElement: HTMLElement): monaco.editor.IStandaloneCodeEditor {
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
  return monaco.editor.create(editorElement, {
    theme: "dos-edit",
    fontFamily: "Web IBM VGA 8x16",
    fontSize: 16,
    language: "qbasic",
    glyphMargin: true,
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const shell = new Shell(assertHTMLElement(document.querySelector('.shell')));
});