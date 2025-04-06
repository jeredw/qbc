import { LightPenTarget, LightPenTrigger } from './LightPen.ts';
import { Printer, BasePrinter, StringPrinter } from './Printer.ts';

interface Attributes {
  fgColor: number;
  bgColor: number;
}

interface CharacterCell {
  char: string;
  attributes: Attributes;
}

interface ScreenMode {
  mode: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
  colors: number;
  attributes: number;
  pages: number;
  graphics: boolean;
  font: string;
  transform?: string;
}

const SCREEN_MODES = [
  {
    mode: 0,
    width: 720,
    height: 400,
    columns: 80,
    rows: 25,
    colors: 64,
    attributes: 16,
    pages: 8,
    graphics: false,
    font: 'Web IBM VGA 9x16',
    transform: 'scaleY(1.35)',
  },
  {
    mode: 1,
    width: 320,
    height: 200,
    columns: 40,
    rows: 25,
    colors: 16,
    attributes: 4,
    pages: 1,
    graphics: true,
    font: 'Web IBM VGA 9x8'
  },
  {
    mode: 2,
    width: 640,
    height: 200,
    columns: 80,
    rows: 25,
    colors: 16,
    attributes: 2,
    pages: 1,
    graphics: true,
    font: 'Web IBM VGA 9x8'
  },
];

const CELL_WIDTH = 8;
const CELL_HEIGHT = 16;
const FONT_SIZE = 16;
const DEFAULT_PALETTE = new Map([
  [0, "#000000"],
  [1, "#0000a0"],
  [2, "#00a000"],
  [3, "#00a0a0"],
  [4, "#a00000"],
  [5, "#a000a0"],
  [6, "#a08000"],
  [7, "#a0a0a0"],
  [8, "#808080"],
  [9, "#0000ff"],
  [10, "#00ff00"],
  [11, "#00ffff"],
  [12, "#ff0000"],
  [13, "#ff00ff"],
  [14, "#ffff00"],
  [15, "#ffffff"],
]);

export interface Screen extends Printer, LightPenTarget {
  showCursor(insert: boolean): void;
  hideCursor(): void;
  moveCursor(dx: number): void;
}

export class TestScreen extends StringPrinter {
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

  triggerPen(x: number, y: number): LightPenTrigger | void {
    return {
      row: Math.floor(y / 8),
      column: Math.floor(x / 8),
      x: Math.floor(x / 8) * 8,
      y: Math.floor(y / 8) * 8
    };
  }
}

enum CursorState {
  HIDDEN,
  SHOWN,
  SHOWN_INSERT,
}

export class CanvasScreen extends BasePrinter implements Screen {
  private mode: ScreenMode;
  private color: Attributes;
  private scrollStartRow: number;
  private scrollEndRow: number;
  private buffer: CharacterCell[][];
  private dirty = true;
  private cursorState: CursorState = CursorState.HIDDEN;
  private cellWidth: number;
  private cellHeight: number;
  canvas: HTMLCanvasElement;

  constructor(modeNumber: number) {
    const mode = SCREEN_MODES[modeNumber];
    if (!mode) {
      throw new Error(`invalid screen mode ${modeNumber}`);
    }
    super(mode.columns);
    this.mode = mode;
    this.scrollStartRow = 1;
    this.scrollEndRow = mode.rows;
    this.color = {fgColor: 7, bgColor: 0};
    this.buffer = new Array(mode.rows);
    for (let y = 0; y < mode.rows; y++) {
      this.buffer[y] = new Array(mode.columns).fill({
        char: ' ',
        attributes: {...this.color}
      });
    }
    this.cellWidth = mode.width / mode.columns;
    this.cellHeight = mode.height / mode.rows;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'screen';
    this.canvas.setAttribute('tabindex', '1');
    this.canvas.width = mode.width;
    this.canvas.height = mode.height;
    if (mode.transform) {
      this.canvas.style.transform = mode.transform;
    }
  }

  render() {
    const ctx = this.canvas.getContext('2d')!;
    this.drawCursor(ctx);
    
    if (!this.dirty) {
      return
    }
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = `${this.cellHeight}px '${this.mode.font}'`;
    ctx.textBaseline = 'top';
    for (let row = 1; row <= this.mode.rows; row++) {
      for (let col = 1; col <= this.mode.columns; col++) {
        this.drawCell(ctx, row, col);
      }
    }
    this.dirty = false;
  }

  private drawCursor(ctx: CanvasRenderingContext2D) {
    if (this.cursorState === CursorState.HIDDEN) {
      return;
    }
    const x = (this.column - 1) * this.cellWidth;
    const y = (this.row - 1) * this.cellHeight;
    const cell = this.at(this.row, this.column);
    const blinkOn = (performance.now() % 476) < 238;
    if (blinkOn) {
      ctx.fillStyle = this.cssForColor(cell.attributes.fgColor);
      if (this.cursorState === CursorState.SHOWN_INSERT) {
        ctx.fillRect(x, y + this.cellHeight / 2, this.cellWidth - 1, this.cellHeight / 2);
      } else {
        ctx.fillRect(x, y + this.cellHeight - 2, this.cellWidth - 1, 1);
      }
    } else {
      ctx.clearRect(x, y, this.cellWidth, this.cellHeight);
      this.drawCell(ctx, this.row, this.column);
    }
  }

  private drawCell(ctx: CanvasRenderingContext2D, row: number, col: number) {
    const x = (col - 1) * this.cellWidth;
    const y = (row - 1) * this.cellHeight;
    const cell = this.at(row, col);
    ctx.fillStyle = this.cssForColor(cell.attributes.bgColor);
    ctx.fillRect(x, y, this.cellWidth, this.cellHeight);
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

  triggerPen(x: number, y: number): LightPenTrigger | void {
    if (x < 0 || y < 0 || x > this.canvas.width || y > this.canvas.height) {
      return;
    }
    const [row, column] = [
      1 + Math.floor(y / this.cellHeight),
      1 + Math.floor(x / this.cellWidth),
    ];
    const cell = this.at(row, column);
    if (cell.char === ' ' || (cell.attributes.fgColor === 0 && cell.attributes.bgColor === 0)) {
      return;
    }
    return { row, column, x: (column - 1) * this.cellWidth, y: (row - 1) * this.cellHeight };
  }
}