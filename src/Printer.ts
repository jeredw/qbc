export interface Printer {
  print(text: string, newline: boolean): void;
  space(numSpaces: number): void;
  tab(targetColumn?: number): void;
}

const TAB_STOP = 14;
const CHAR_DELAY = 1000 / 80;
const NEWLINE_DELAY = CHAR_DELAY * 80 * .5;

export class LinePrinter implements Printer {
  width: number;
  paperWindow: HTMLElement;
  paper: HTMLElement;
  text: HTMLElement;
  column: number = 0;
  buffer: string[] = [];
  lastFrame: number = 0;
  linesPrinted: number = 0;
  delay: number = 0;
  audio: HTMLAudioElement;

  constructor(width: number) {
    this.width = width;
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
    // Include some invisible text so the dot matrix webfont gets loaded.
    this.paper.appendChild(document.createTextNode(" "));
    this.audio = document.createElement('audio');
    this.audio.src = "printer.wav";
    this.audio.loop = true;
    this.audio.muted = true;
    this.paper.appendChild(this.audio);
  }

  enableAudio() {
    this.audio.play();
    this.audio.muted = true;
  }

  disableAudio() {
    this.audio.pause();
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
      this.text.innerText += ch;
      if (ch === '\n') {
        this.linesPrinted++;
        if (this.linesPrinted > 5) {
          this.paperWindow.scrollTop += 16;
        }
        this.delay += NEWLINE_DELAY;
      } else {
        this.delay += CHAR_DELAY;
      }
    }
    this.lastFrame = timestamp;
  }

  private spaceLeftOnLine() {
    return this.width - this.column;
  }

  private putChar(ch: string) {
    this.buffer.push(ch);
  }

  private newLine() {
    this.putChar('\n');
    this.column = 0;
  }

  private putString(text: string) {
    for (const ch of text) {
      this.putChar(ch);
    }
    this.column += text.length;
  }

  print(text: string, newline: boolean) {
    while (text.length > 0) {
      const space = this.spaceLeftOnLine();
      if (text.length > space) {
        this.putString(text.slice(0, space));
        text = text.slice(space);
        this.newLine();
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
      if (this.column + numSpaces >= this.width) {
        const spacesOnThisLine = this.width - this.column;
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
      if (this.column + 1 > targetColumn) {
        this.newLine();
      }
      this.putString(' '.repeat(targetColumn - (this.column + 1)));
      return;
    }

    const start = TAB_STOP * Math.floor(this.column / TAB_STOP);
    const nextStop = start + TAB_STOP;
    if (nextStop > this.width) {
      this.newLine();
      return;
    }
    this.putString(' '.repeat(nextStop - this.column));
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