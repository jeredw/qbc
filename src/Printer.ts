import { charToAscii, CR, LF, TAB } from './AsciiChart.ts'

export interface Printer {
  print(text: string, newline: boolean): void;
  space(numSpaces: number): void;
  tab(targetColumn?: number): void;
  setWidth(columns: number): void;
  getColumn(): number;
}

const TAB_STOP = 14;

export abstract class BasePrinter implements Printer {
  width: number;
  column: number = 1;
  row: number = 1;

  constructor(width: number) {
    this.width = width;
  }

  setWidth(columns: number): void {
    this.width = columns;
  }

  getColumn(): number {
    return this.column;
  }

  abstract putChar(ch: string): void;

  protected newLine(hanging = false) {
    this.column = 1;
    this.row++;
    this.putChar(LF);
  }

  private spaceLeftOnLine() {
    return this.width - this.column + 1;
  }

  protected putString(text: string) {
    for (const ch of text) {
      if (ch === CR || ch === LF) {
        this.newLine();
      } else {
        this.putChar(ch);
        this.column++;
      }
    }
  }

  print(text: string, newline: boolean) {
    if (this.column > 1 && this.spaceLeftOnLine() < text.length) {
      this.newLine();
    }
    while (text.length > 0) {
      const space = this.spaceLeftOnLine();
      if (text.length >= space) {
        // Note: If text exactly fills the line, newline after it so that column
        // wraps back to 1. But if newline is false, flag this condition as a
        // hanging newline, so that it is possible to print into the last cell
        // of the screen without scrolling.
        this.putString(text.slice(0, space));
        text = text.slice(space);
        this.newLine(text.length === 0 && !newline);
        if (text.length === 0) {
          return;
        }
      } else {
        this.putString(text);
        break;
      }
    }
    if (newline) {
      this.newLine();
    }
  }

  space(numSpaces: number) {
    if (numSpaces > 0) {
      numSpaces = numSpaces % this.width;
      if (this.column + numSpaces > this.width) {
        const spacesOnThisLine = this.spaceLeftOnLine();
        this.putString(' '.repeat(spacesOnThisLine));
        this.newLine();
        numSpaces -= spacesOnThisLine;
      }
      if (numSpaces > 0) {
        this.putString(' '.repeat(numSpaces));
      }
    }
  }

  tab(targetColumn?: number) {
    if (targetColumn !== undefined) {
      targetColumn = wrapColumn(targetColumn, this.width);
      if (this.column > targetColumn) {
        this.newLine();
      }
      this.putString(' '.repeat(targetColumn - this.column));
      return;
    }

    const start = 1 + TAB_STOP * Math.floor((this.column - 1) / TAB_STOP);
    const nextStop = start + TAB_STOP;
    const endOfLastFullZone = TAB_STOP * Math.floor((this.width - 1) / TAB_STOP);
    if (nextStop > endOfLastFullZone) {
      this.newLine();
      return;
    }
    this.putString(' '.repeat(nextStop - this.column));
  }
}

export class TestPrinter extends BasePrinter {
  output: string = "";

  constructor() {
    super(80);
  }

  override putChar(ch: string) {
    ch = (
      ch === CR ? '\r' :
      ch === LF ? '\n' :
      ch === TAB ? '\t' :
      ch
    );
    this.output += ch;
  }
}

const CHAR_DELAY = 1000 / 80;
const FONT_DELAY = 5 * CHAR_DELAY;
const NEWLINE_DELAY = CHAR_DELAY * 80 * .5;

interface ControlState {
  bold?: boolean;
  italic?: boolean;
}

export class LinePrinter extends BasePrinter {
  paperWindow: HTMLElement;
  paper: HTMLElement;
  text: HTMLElement;
  buffer: string[] = [];
  lastFrame: number = 0;
  linesPrinted: number = 0;
  delay: number = 0;
  audio: HTMLAudioElement;
  control: ControlState = {};

  constructor(width: number) {
    super(width);
    this.paperWindow = document.createElement('div');
    this.paperWindow.className = 'paper-window';
    this.paper = document.createElement('div');
    this.paperWindow.appendChild(this.paper);
    const leftTrack = document.createElement('div');
    leftTrack.className = 'track';
    leftTrack.style.left = '0';
    const rightTrack = document.createElement('div');
    rightTrack.className = 'track';
    rightTrack.style.right = '0';
    this.text = document.createElement('div');
    this.paper.className = 'paper';
    this.paper.appendChild(leftTrack);
    this.paper.appendChild(rightTrack);
    this.paper.appendChild(this.text);
    this.audio = document.createElement('audio');
    this.audio.src = "printer.wav";
    this.audio.loop = true;
    this.audio.muted = true;
    this.paper.appendChild(this.audio);
    this.hide();
  }

  enableAudio() {
    this.audio.play();
    this.audio.muted = true;
  }

  disableAudio() {
    this.audio.pause();
  }

  hide() {
    this.paper.style.display = 'none';
  }

  show() {
    this.paper.style.display = '';
  }

  render(timestamp: number) {
    if (!this.lastFrame) {
      this.lastFrame = timestamp;
    }
    const elapsed = timestamp - this.lastFrame;
    if (this.buffer.length > 0) {
      this.delay -= elapsed;
      this.audio.muted = false;
    } else {
      this.audio.muted = true;
    }
    while (this.delay < 0 && this.buffer.length > 0) {
      const ch = this.buffer.shift()!;
      if (charToAscii.get(ch) === 0x1b) {
        // https://files.support.epson.com/pdf/general/escp2ref.pdf 
        const command = this.buffer.shift();
        const code = charToAscii.get(command || '');
        switch (code) {
          case 69:  // ESC E
            this.control.bold = true;
            this.delay += FONT_DELAY;
            break;
          case 70:  // ESC F
            this.control.bold = false;
            this.delay += FONT_DELAY;
            break;
          case 52:  // ESC 4
            this.control.italic = true;
            this.delay += FONT_DELAY;
            break;
          case 53:  // ESC 5
            this.control.italic = false;
            this.delay += FONT_DELAY;
            break;
        }
      } else if (ch === LF) {
        this.linesPrinted++;
        if (this.linesPrinted > 5) {
          this.paperWindow.scrollTop += 16;
        }
        this.delay += NEWLINE_DELAY;
        this.text.innerHTML += '<br>';
      } else {
        this.delay += CHAR_DELAY;
        if (this.control.bold || this.control.italic) {
          const span = document.createElement('span');
          span.innerText = ch;
          if (this.control.bold) {
            span.classList.add('bold');
          }
          if (this.control.italic) {
            span.classList.add('italic');
          }
          this.text.appendChild(span);
        } else {
          this.text.innerHTML += ch;
        }
      }
    }
    this.lastFrame = timestamp;
  }

  override putChar(ch: string) {
    this.buffer.push(ch);
  }
}

function wrapColumn(column: number, width: number): number {
  if (column <= 0) {
    return 1;
  }
  if (column > width) {
    return column % width;
  }
  return column;
}