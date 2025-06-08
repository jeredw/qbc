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

const TAB_STOPS = 8;

class Shell {
  private root: HTMLElement;
  private interpreter: Interpreter;
  private invocation: Invocation | null = null;

  private codePane: HTMLElement;
  private error: HTMLElement | null;
  private runButton: HTMLElement;
  private stopButton: HTMLElement;
  private playButton: HTMLElement;
  private muteButton: HTMLElement;

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
    this.codePane = assertHTMLElement(root.querySelector('.code-pane'));
    this.runButton = assertHTMLElement(root.querySelector('.run-button'));
    this.runButton.addEventListener('click', () => this.run());
    this.stopButton = assertHTMLElement(root.querySelector('.stop-button'));
    this.stopButton.addEventListener('click', () => this.stop());
    this.playButton = assertHTMLElement(root.querySelector('.play-button'));
    this.playButton.addEventListener('click', () => this.playAudio());
    this.muteButton = assertHTMLElement(root.querySelector('.mute-button'));
    this.muteButton.addEventListener('click', () => this.muteAudio());
    this.error = this.codePane.querySelector('.error');
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
    if (document.activeElement != this.codePane) {
      return;
    }
    switch (e.key) {
      case 'Enter':
        if (e.altKey || e.metaKey) {
          if (!this.invocation || this.invocation.isStopped()) {
            setTimeout(() => this.run());
          } else {
            setTimeout(() => this.stop());
          }
        } else {
          // Default behavior is to insert <br> nodes.
          insertText(this.codePane, '\n');
          this.clearErrors();
        }
        e.preventDefault();
        return false;
      case 'Tab':
        // Default behavior is to switch focus.
        insertText(this.codePane, '\t');
        this.clearErrors();
        e.preventDefault();
        return false;
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
    const text = this.codePane.innerText;
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
      this.codePane.focus();
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
    if (this.error) {
      this.error.classList.remove('error');
      const tooltip = this.error.querySelector('.tooltip-text');
      tooltip?.remove();
      this.error = null;
    }
  }

  private markError(line: number, column: number, length: number, message: string) {
    const text = this.codePane.innerText;
    const lines = (text + '\n').split('\n');
    const beforeErrorText = lines[line].slice(0, column);
    const errorText = lines[line].slice(column, column + length);
    const afterErrorText = lines[line].slice(column + length);
    lines[line] = `${beforeErrorText}${errorHtml(errorText, message)}${afterErrorText}`;
    this.codePane.innerHTML = lines.join('\n');
    this.error = this.codePane.querySelector('.error');
    if (this.error) {
      this.error.scrollIntoView();
      const selection = window.getSelection();
      if (selection) {
        const range = new Range();
        range.setStartBefore(this.error);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }

  private showErrorMessage(error: ParseError | RuntimeError) {
    const {line, column, length} = error.location;
    if (length) {
      this.clearErrors();
      this.markError(line - 1, column, length, error.message);
    }
    console.error(line, column, length, error.message);
  }
}

function errorHtml(programText: string, message: string) {
  return `<span class="error">${programText}` +
    `<div class="tooltip-text" contenteditable="false">↑ ${message}</div>` +
    `</span>`;
}

function insertText(editor: HTMLElement, text: string) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) {
    return;
  }
  const range = selection.getRangeAt(0);
  range.collapse();
  const expandedText = expandText(editor, range, text);
  const node = document.createTextNode(expandedText);
  const anchor = document.createElement('span');
  range.insertNode(anchor);
  range.insertNode(node);
  anchor.scrollIntoView();
  anchor.remove();
  range.setStartAfter(node);
}

function expandText(editor: HTMLElement, range: Range, text: string) {
  if (text == '\t') {
    // Convert tabs to the appropriate number of spaces.
    const beforeRange = range.cloneRange();
    beforeRange.selectNodeContents(editor);
    beforeRange.setEnd(range.endContainer, range.endOffset);
    const beforeText = beforeRange.toString();
    const offset = beforeText.length;
    const offsetInLine = offset - beforeText.lastIndexOf('\n');
    const spacesToTab = TAB_STOPS - ((offsetInLine - 1) % TAB_STOPS);
    return " ".repeat(spacesToTab);
  }
  if (text == '\n') {
    // Need two newlines at the end of the input.
    const afterRange = range.cloneRange();
    afterRange.selectNodeContents(editor);
    afterRange.setStart(range.endContainer, range.endOffset);
    if (afterRange.toString().length == 0) {
      return "\n\n";
    }
  }
  return text;
}

document.addEventListener("DOMContentLoaded", () => {
  const shell = new Shell(assertHTMLElement(document.querySelector('.shell')));
});

function assertHTMLElement(element: Element | null): HTMLElement {
  if (!(element instanceof HTMLElement)) {
    throw new Error("expecting element");
  }
  return element;
}