import { Interpreter } from "./Interpreter.ts";
import { ParseError, RuntimeError } from "./Errors.ts";
import { CanvasTextScreen } from "./Screen.ts";
import { Invocation } from "./Invocation.ts";

const TAB_STOPS = 8;

class Shell {
  private root: HTMLElement;
  private interpreter: Interpreter;
  private invocation: Invocation | null = null;

  private codePane: HTMLElement;
  private error: HTMLElement | null;
  private runButton: HTMLElement;
  private stopButton: HTMLElement;

  private screen: CanvasTextScreen;

  constructor(root: HTMLElement) {
    this.root = root;
    this.screen = new CanvasTextScreen(80, 25);
    this.root.appendChild(this.screen.canvas);
    requestAnimationFrame(this.updateScreen);
    this.interpreter = new Interpreter({
      textScreen: this.screen
    });
    this.codePane = assertHTMLElement(root.querySelector('.code-pane'));
    this.runButton = assertHTMLElement(root.querySelector('.run-button'));
    this.runButton.addEventListener('click', () => this.run());
    this.stopButton = assertHTMLElement(root.querySelector('.stop-button'));
    this.stopButton.addEventListener('click', () => this.stop());
    this.error = this.codePane.querySelector('.error');
    document.addEventListener('keydown', (e: KeyboardEvent) => {
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
      console.log(e);
    });
  }

  async run() {
    this.clearErrors();
    const text = this.codePane.innerText;
    try {
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
    }
  }

  step() {
    this.invocation?.step();
  }

  stop() {
    this.root.classList.remove('running');
    this.invocation?.stop();
  }

  private updateScreen = () => {
    this.screen.render();
    requestAnimationFrame(this.updateScreen);
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