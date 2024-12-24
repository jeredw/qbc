import { Interpreter } from './Interpreter.ts';
import { ParseError } from "./Errors.ts";

const TAB_STOPS = 8;

class Shell {
  private root: HTMLElement;
  private codePane: HTMLElement;
  private interpreter: Interpreter;
  private error: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.interpreter = new Interpreter();
    this.codePane = root.querySelector('.code-pane');
    this.error = this.codePane.querySelector('.error');
    this.codePane.addEventListener('input', () => {
      this.clearErrors();
    });
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (document.activeElement != this.codePane) {
        return;
      }
      switch (e.key) {
        case 'Enter':
          // Default behavior is to insert <br> nodes.
          insertText(this.codePane, '\n');
          e.preventDefault();
          this.clearErrors();
          return false;
        case 'Tab':
          // Default behavior is to switch focus.
          insertText(this.codePane, '\t');
          e.preventDefault();
          this.clearErrors();
          return false;
      }
      console.log(e);
    });
    const runButton = root.querySelector('.run-button');
    runButton.addEventListener('click', () => this.run());
  }

  run() {
    const text = this.codePane.innerText;
    try {
      this.interpreter.run(text);
    } catch (error: unknown) {
      if (error instanceof ParseError) {
        this.showParseError(error);
      }
    }
  }

  private clearErrors() {
    if (this.error) {
      this.error.classList.remove('error');
      this.error.removeAttribute('title');
      this.error = null;
    }
  }

  private markError(line: number, column: number, length: number, message: string) {
    const text = this.codePane.innerText;
    const lines = text.split('\n');
    const beforeErrorText = lines[line].substr(0, column);
    const errorText = lines[line].substr(column, length);
    const afterErrorText = lines[line].substr(column + length);
    lines[line] = `${beforeErrorText}<span class="error">${errorText}</span>${afterErrorText}`;
    this.codePane.innerHTML = lines.join('\n');
    this.error = this.codePane.querySelector('.error');
    if (this.error) {
      this.error.setAttribute('title', message);
      this.error.scrollIntoView();
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

function insertText(editor, text) {
  const selection = window.getSelection();
  if (!selection.rangeCount) {
    return;
  }
  const range = selection.getRangeAt(0);
  range.collapse();
  const expandedText = expandTab(editor, range, text);
  const node = document.createTextNode(expandedText);
  range.insertNode(node);
  range.setStartAfter(node);
}

// Convert tabs into the appropriate number of spaces.
function expandTab(editor: HTMLElement, range: Range, text: string) {
  if (text == '\t') {
    const beforeRange = range.cloneRange();
    beforeRange.selectNodeContents(editor);
    beforeRange.setEnd(range.endContainer, range.endOffset);
    const beforeText = beforeRange.toString();
    const offset = beforeText.length;
    const offsetInLine = offset - beforeText.lastIndexOf('\n');
    const spacesToTab = TAB_STOPS - ((offsetInLine - 1) % TAB_STOPS);
    return " ".repeat(spacesToTab);
  }
  return text;
}

document.addEventListener("DOMContentLoaded", () => {
  const shell = new Shell(document.querySelector('.shell'));
});