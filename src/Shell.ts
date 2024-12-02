import {Interpreter} from './Interpreter.ts';

class Shell {
  private root: HTMLElement;
  private codePane: HTMLElement;
  private interpreter: Interpreter;

  constructor(root: HTMLElement) {
    this.root = root;
    this.interpreter = new Interpreter();
    this.codePane = root.querySelector('.code-pane');
    const runButton = root.querySelector('.run-button');
    runButton.addEventListener('click', () => this.run());
  }

  run() {
    const text = this.codePane.innerText;
    this.interpreter.run(text);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const shell = new Shell(document.querySelector('.shell'));
});