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

export interface TextScreen {
  print(text: string, newline: boolean): void;
}

export class TestTextScreen implements TextScreen {
  output: string = "";

  print(text: string, newline_: boolean) {
    this.output += text;
    if (newline_) {
      this.output += '\n';
    }
  }
}

export class CanvasTextScreen implements TextScreen {
  private _width: number;
  private _height: number;
  private _color: Attributes;
  private _row: number;
  private _column: number;
  private _scrollStartRow: number;
  private _scrollEndRow: number;
  private _buffer: CharacterCell[][];
  private _canvas: HTMLCanvasElement;
  private _dirty = true;

  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;
    this._row = 1;
    this._column = 1;
    this._scrollStartRow = 1;
    this._scrollEndRow = height - 1;
    this._color = {fgColor: 15, bgColor: 0};
    this._buffer = new Array(height);
    for (let y = 0; y < height; y++) {
      this._buffer[y] = new Array(width).fill({
        char: ' ',
        attributes: {...this._color}
      });
    }
    this._canvas = document.createElement('canvas');
    this._canvas.width = CELL_WIDTH * width;
    this._canvas.height = CELL_HEIGHT * height;
  }

  get column() {
    return this._column;
  }

  set column(column: number) {
    this._column = column;
  }

  get row() {
    return this._row;
  }

  set row(row: number) {
    this._row = row;
  }

  get canvas() {
    return this._canvas;
  }

  render() {
    if (!this._dirty) {
      return
    }
    const ctx = this._canvas.getContext('2d')!;
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    ctx.font = `${FONT_SIZE}px 'Web IBM VGA 8x16'`;
    ctx.textBaseline = 'top';
    for (let row = 1; row <= this._height; row++) {
      for (let col = 1; col <= this._width; col++) {
        const x = (col - 1) * CELL_WIDTH;
        const y = (row - 1) * CELL_HEIGHT;
        const cell = this.at(row, col);
        ctx.fillStyle = this.cssForColor(cell.attributes.bgColor);
        ctx.fillRect(x, y, CELL_WIDTH, CELL_HEIGHT);
        ctx.fillStyle = this.cssForColor(cell.attributes.fgColor);
        ctx.fillText(cell.char, x, y);
      }
    }
    this._dirty = false;
  }

  private cssForColor(index: number): string {
    return DEFAULT_PALETTE.get(index) ?? '#fff';
  }

  print(text: string, newline: boolean = true) {
    for (let i = 0; i < text.length; i++) {
      this.printChar(text.charAt(i));
    }
    if (newline) {
      this._column = 1;
      this._row++;
    }
  }

  at(row: number, col: number) {
    return this._buffer[row - 1][col - 1];
  }

  putAt(row: number, col: number, char: CharacterCell) {
    this._buffer[row - 1][col - 1] = char;
  }

  private printChar(char: string) {
    if (this._row == this._scrollEndRow) {
      for (let row = this._scrollStartRow; row < this._scrollEndRow; row++) {
        this._buffer[row - 1] = this._buffer[row].slice();
      }
      if (this._scrollEndRow > this._scrollStartRow) {
        this._buffer[this._scrollEndRow - 2].fill({
          char: ' ', attributes: {...this._color}
        });
      }
      this._row = this._scrollEndRow - 1;
      this._column = 1;
    }
    this.putAt(this._row, this._column, {
      char, attributes: {...this._color}
    });
    this._dirty = true;
    this._column++;
    if (this._column >= this._width) {
      this._column = 1;
      this._row++;
    }
  }
}