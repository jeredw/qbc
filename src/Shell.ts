import { Interpreter } from './Interpreter.ts';
import { ParseError } from "./Errors.ts";

const TAB_STOPS = 8;

class Shell {
  private root: HTMLElement;
  private interpreter: Interpreter;

  private codePane: HTMLElement;
  private error: HTMLElement | null;
  private runButton: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.interpreter = new Interpreter();
    this.codePane = assertHTMLElement(root.querySelector('.code-pane'));
    this.runButton = assertHTMLElement(root.querySelector('.run-button'));
    this.runButton.addEventListener('click', () => this.run());
    this.error = this.codePane.querySelector('.error');
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (document.activeElement != this.codePane) {
        return;
      }
      switch (e.key) {
        case 'Enter':
          if (e.altKey || e.metaKey) {
            setTimeout(() => this.run());
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
      // console.log(e);
    });
  }

  run() {
    this.clearErrors();
    const text = this.codePane.innerText;
    try {
      this.interpreter.run(text);
    } catch (error: unknown) {
      if (error instanceof ParseError) {
        this.showParseError(error);
      } else {
        throw error;
      }
    }
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

  private showParseError(error: ParseError) {
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