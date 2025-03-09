import { Printer, BasePrinter } from './Printer.ts';

interface Attributes {
  fgColor: number;
  bgColor: number;
}

interface CharacterCell {
  char: string;
  attributes: Attributes;
}

const CELL_WIDTH = 6;
const CELL_HEIGHT = 12;
const FONT_SIZE = 12;
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
}

export class CanvasTextScreen extends BasePrinter implements TextScreen {
  private height: number;
  private color: Attributes;
  private scrollStartRow: number;
  private scrollEndRow: number;
  private buffer: CharacterCell[][];
  private dirty = true;
  canvas: HTMLCanvasElement;

  constructor(width: number, height: number) {
    super(width);
    this.height = height;
    this.scrollStartRow = 1;
    this.scrollEndRow = height;
    this.color = {fgColor: 15, bgColor: 0};
    this.buffer = new Array(height);
    for (let y = 0; y < height; y++) {
      this.buffer[y] = new Array(width).fill({
        char: ' ',
        attributes: {...this.color}
      });
    }
    this.canvas = document.createElement('canvas');
    this.canvas.width = CELL_WIDTH * width;
    this.canvas.height = CELL_HEIGHT * height;
  }

  render() {
    if (!this.dirty) {
      return
    }
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = `${FONT_SIZE}px 'Web IBM VGA 8x16'`;
    ctx.textBaseline = 'top';
    for (let row = 1; row <= this.height; row++) {
      for (let col = 1; col <= this.width; col++) {
        const x = (col - 1) * CELL_WIDTH;
        const y = (row - 1) * CELL_HEIGHT;
        const cell = this.at(row, col);
        ctx.fillStyle = this.cssForColor(cell.attributes.bgColor);
        ctx.fillRect(x, y, CELL_WIDTH, CELL_HEIGHT);
        ctx.fillStyle = this.cssForColor(cell.attributes.fgColor);
        ctx.fillText(cell.char, x, y);
      }
    }
    this.dirty = false;
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
}