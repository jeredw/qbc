import { Printer, BasePrinter, StringPrinter } from './Printer.ts';

interface Attributes {
  fgColor: number;
  bgColor: number;
}

interface CharacterCell {
  char: string;
  attributes: Attributes;
}

const CELL_WIDTH = 8;
const CELL_HEIGHT = 16;
const FONT_SIZE = 16;
const DEFAULT_PALETTE = new Map([
  [0, "#000000"],
  [1, "#0000b0"],
  [2, "#00b000"],
  [3, "#00b0b0"],
  [4, "#b00000"],
  [5, "#b000b0"],
  [6, "#b08000"],
  [7, "#b0b0b0"],
  [8, "#b0b0b0"],
  [9, "#0000ff"],
  [10, "#00ff00"],
  [11, "#00ffff"],
  [12, "#ff0000"],
  [13, "#ff00ff"],
  [14, "#ffff00"],
  [15, "#ffffff"],
]);

export interface TextScreen extends Printer {
  showCursor(insert: boolean): void;
  hideCursor(): void;
  moveCursor(dx: number): void;
}

export class TestTextScreen extends StringPrinter {
  constructor() {
    super();
  }

  showCursor(insert: boolean) {
    this.putString(insert ? '■' : '␣');
  }

  hideCursor() {
    this.putString('□');
  }

  moveCursor(dx: number) {
    this.putString((dx < 0 ? '←' : '→').repeat(Math.abs(dx)));
  }
}

enum CursorState {
  HIDDEN,
  SHOWN,
  SHOWN_INSERT,
}

export class CanvasTextScreen extends BasePrinter implements TextScreen {
  private height: number;
  private color: Attributes;
  private scrollStartRow: number;
  private scrollEndRow: number;
  private buffer: CharacterCell[][];
  private dirty = true;
  private cursorState: CursorState = CursorState.HIDDEN;
  canvas: HTMLCanvasElement;

  constructor(width: number, height: number) {
    super(width);
    this.height = height;
    this.scrollStartRow = 1;
    this.scrollEndRow = height;
    this.color = {fgColor: 7, bgColor: 0};
    this.buffer = new Array(height);
    for (let y = 0; y < height; y++) {
      this.buffer[y] = new Array(width).fill({
        char: ' ',
        attributes: {...this.color}
      });
    }
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'screen';
    this.canvas.setAttribute('tabindex', '1');
    this.canvas.width = CELL_WIDTH * width;
    this.canvas.height = CELL_HEIGHT * height;
  }

  render() {
    const ctx = this.canvas.getContext('2d')!;
    this.drawCursor(ctx);
    
    if (!this.dirty) {
      return
    }
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = `${FONT_SIZE}px 'Web IBM VGA 8x16'`;
    ctx.textBaseline = 'top';
    for (let row = 1; row <= this.height; row++) {
      for (let col = 1; col <= this.width; col++) {
        this.drawCell(ctx, row, col);
      }
    }
    this.dirty = false;
  }

  private drawCursor(ctx: CanvasRenderingContext2D) {
    if (this.cursorState === CursorState.HIDDEN) {
      return;
    }
    const x = (this.column - 1) * CELL_WIDTH;
    const y = (this.row - 1) * CELL_HEIGHT;
    const cell = this.at(this.row, this.column);
    const blinkOn = (performance.now() % 476) < 238;
    if (blinkOn) {
      ctx.fillStyle = this.cssForColor(cell.attributes.fgColor);
      if (this.cursorState === CursorState.SHOWN_INSERT) {
        ctx.fillRect(x, y + CELL_HEIGHT / 2, CELL_WIDTH - 1, CELL_HEIGHT / 2);
      } else {
        ctx.fillRect(x, y + CELL_HEIGHT - 2, CELL_WIDTH - 1, 1);
      }
    } else {
      ctx.clearRect(x, y, CELL_WIDTH, CELL_HEIGHT);
      this.drawCell(ctx, this.row, this.column);
    }
  }

  private drawCell(ctx: CanvasRenderingContext2D, row: number, col: number) {
    const x = (col - 1) * CELL_WIDTH;
    const y = (row - 1) * CELL_HEIGHT;
    const cell = this.at(row, col);
    ctx.fillStyle = this.cssForColor(cell.attributes.bgColor);
    ctx.fillRect(x, y, CELL_WIDTH, CELL_HEIGHT);
    ctx.fillStyle = this.cssForColor(cell.attributes.fgColor);
    ctx.fillText(cell.char, x, y);
  }

  private cssForColor(index: number): string {
    return DEFAULT_PALETTE.get(index) ?? '#fff';
  }

  at(row: number, col: number) {
    return this.buffer[row - 1][col - 1];
  }

  putAt(row: number, col: number, char: CharacterCell) {
    this.buffer[row - 1][col - 1] = char;
  }

  protected override newLine() {
    this.column = 1;
    this.row++;
    if (this.row == this.scrollEndRow) {
      for (let row = this.scrollStartRow; row < this.scrollEndRow; row++) {
        this.buffer[row - 1] = this.buffer[row].slice();
      }
      if (this.scrollEndRow > this.scrollStartRow) {
        this.buffer[this.scrollEndRow - 2].fill({
          char: ' ', attributes: {...this.color}
        });
      }
      this.row = this.scrollEndRow - 1;
      this.column = 1;
      this.dirty = true;
    }
  }

  override putChar(char: string) {
    this.putAt(this.row, this.column, {
      char, attributes: {...this.color}
    });
    this.dirty = true;
  }

  showCursor(insert: boolean) {
    this.cursorState = insert ? CursorState.SHOWN_INSERT : CursorState.SHOWN;
    this.dirty = true;
  }
  
  hideCursor() {
    this.cursorState = CursorState.HIDDEN;
    this.dirty = true;
  }

  moveCursor(dx: number) {
    this.column += dx;
    while (this.column > this.width) {
      this.column -= this.width;
      this.row++;
    }
    while (this.column < 1) {
      this.column += this.width;
      this.row--;
    }
    this.dirty = true;
  }
}