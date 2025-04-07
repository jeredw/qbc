import { LightPenTarget, LightPenTrigger } from './LightPen.ts';
import { Printer, BasePrinter, StringPrinter } from './Printer.ts';
import { SCREEN_MODES, ScreenMode } from './ScreenMode.ts';

export interface Screen extends Printer, LightPenTarget {
  configure(modeNumber: number, colorSwitch: number, activePage: number, visiblePage: number): void;

  showCursor(insert: boolean): void;
  hideCursor(): void;
  moveCursor(dx: number): void;
}

export class TestScreen extends StringPrinter {
  constructor() {
    super();
  }

  configure(modeNumber: number, colorSwitch: number, activePage: number, visiblePage: number) {
    this.putString(`[SCREEN ${modeNumber}, ${colorSwitch}, ${activePage}, ${visiblePage}]\n`);
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

interface Attributes {
  fgColor: number;
  bgColor: number;
}

interface CharacterCell {
  char: string;
  attributes: Attributes;
}

interface Color {
  red: number;
  green: number;
  blue: number;
}

const DEFAULT_PALETTE: Color[] = [
  {red: 0, green: 0, blue: 0},
  {red: 0, green: 0, blue: 160},
  {red: 0, green: 160, blue: 0},
  {red: 0, green: 160, blue: 160},
  {red: 160, green: 0, blue: 0},
  {red: 160, green: 0, blue: 160},
  {red: 160, green: 128, blue: 0},
  {red: 160, green: 160, blue: 160},
  {red: 128, green: 128, blue: 128},
  {red: 0, green: 0, blue: 255},
  {red: 0, green: 255, blue: 0},
  {red: 0, green: 255, blue: 255},
  {red: 255, green: 0, blue: 0},
  {red: 255, green: 0, blue: 255},
  {red: 255, green: 255, blue: 0},
  {red: 255, green: 255, blue: 255},
];

function cssForColorIndex(index: number): string {
  return `rgba(${index}, 0, 0, 255)`;
}

function clearCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

class Page {
  dirty: boolean = true;
  private text: CharacterCell[][];
  private cellWidth: number;
  private cellHeight: number;
  private canvas: HTMLCanvasElement;

  constructor(mode: ScreenMode, color: Attributes) {
    this.dirty = true;
    this.text = new Array(mode.rows);
    for (let y = 0; y < mode.rows; y++) {
      this.text[y] = new Array(mode.columns).fill({
        char: ' ',
        attributes: {...color}
      });
    }
    this.cellWidth = mode.width / mode.columns;
    this.cellHeight = mode.height / mode.rows;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'screen';
    this.canvas.width = mode.width;
    this.canvas.height = mode.height;
    this.canvas.style.display = 'none';
    document.body.appendChild(this.canvas);
    // We'll be reading this back a ton so request cpu rendering.
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.font = `${this.cellHeight}px '${mode.font}'`;
    ctx.textBaseline = 'top';
    clearCanvas(this.canvas);
  }

  getCharAt(row: number, col: number) {
    return this.text[row - 1][col - 1];
  }

  putCharAt(row: number, col: number, char: CharacterCell) {
    this.text[row - 1][col - 1] = char;
    const ctx = this.canvas.getContext('2d')!;
    this.drawCell(ctx, row, col);
    this.dirty = true;
  }

  private drawCell(ctx: CanvasRenderingContext2D, row: number, col: number) {
    const x = (col - 1) * this.cellWidth;
    const y = (row - 1) * this.cellHeight;
    const cell = this.getCharAt(row, col);
    ctx.fillStyle = cssForColorIndex(cell.attributes.bgColor);
    ctx.fillRect(x, y, this.cellWidth, this.cellHeight);
    ctx.fillStyle = cssForColorIndex(cell.attributes.fgColor);
    ctx.fillText(cell.char, x, y);
  }

  getImageData(palette: Color[], left: number, top: number, width: number, height: number): ImageData {
    const ctx = this.canvas.getContext('2d')!;
    const colorIndices = ctx.getImageData(left, top, width, height);
    const output = ctx.createImageData(colorIndices);
    let index = 0;
    for (let y = 0; y < colorIndices.height; y++) {
      for (let x = 0; x < colorIndices.width; x++) {
        const paletteIndex = colorIndices.data[index];
        const color = palette[paletteIndex];
        output.data[index] = color.red;
        output.data[index + 1] = color.green;
        output.data[index + 2] = color.blue;
        output.data[index + 3] = 255;
        index += 4;
      }
    }
    return output;
  }

  scroll(startRow: number, endRow: number, color: Attributes) {
    for (let row = startRow; row < endRow; row++) {
      this.text[row - 1] = this.text[row].slice();
    }
    if (endRow > startRow) {
      const ctx = this.canvas.getContext('2d')!;
      const top = startRow * this.cellHeight;
      const height = endRow * this.cellHeight - top;
      const text = ctx.getImageData(0, top, ctx.canvas.width, height);
      ctx.putImageData(text, 0, top - this.cellHeight);
      this.text[endRow - 2].fill({char: ' ', attributes: {...color}});
      for (let i = 0; i < this.text[endRow - 2].length; i++) {
        this.drawCell(ctx, endRow - 1, 1 + i);
      }
    }
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
  private cursorState: CursorState = CursorState.HIDDEN;
  private cellWidth: number;
  private cellHeight: number;
  private pages: Page[];
  private activePage: Page;
  private visiblePage: Page;
  private palette: Color[];
  canvas: HTMLCanvasElement;

  constructor(modeNumber: number) {
    super(0);
    this.configure(modeNumber, 0, 0, 0);
  }

  configure(modeNumber: number, colorSwitch: number, activePage: number, visiblePage: number) {
    const mode = SCREEN_MODES.find((entry) => entry.mode === modeNumber);
    if (!mode) {
      throw new Error(`invalid screen mode ${modeNumber}`);
    }
    if (activePage < 0 || activePage >= mode.pages) {
      throw new Error(`invalid active page ${activePage}`);
    }
    if (visiblePage < 0 || visiblePage >= mode.pages) {
      throw new Error(`invalid visible page ${visiblePage}`);
    }
    if (this.mode && this.mode.mode === modeNumber) {
      this.activePage = this.pages[activePage];
      this.visiblePage = this.pages[visiblePage];
      this.visiblePage.dirty = true;
      clearCanvas(this.canvas);
      return;
    }
    this.mode = mode;
    this.palette = DEFAULT_PALETTE;
    this.width = mode.columns;
    this.column = 1;
    this.row = 1;
    this.scrollStartRow = 1;
    this.scrollEndRow = mode.rows;
    this.color = {fgColor: 7, bgColor: 0};
    this.cellWidth = mode.width / mode.columns;
    this.cellHeight = mode.height / mode.rows;
    this.pages = [];
    for (let i = 0; i < mode.pages; i++) {
      this.pages[i] = new Page(mode, this.color);
    }
    this.activePage = this.pages[activePage];
    this.visiblePage = this.pages[visiblePage];
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'screen';
      this.canvas.setAttribute('tabindex', '1');
    } else {
      this.canvas.style.transform = '';
    }
    this.canvas.width = mode.width;
    this.canvas.height = mode.height;
    if (mode.transform) {
      this.canvas.style.transform = mode.transform;
    }
    clearCanvas(this.canvas);
  }

  render() {
    const ctx = this.canvas.getContext('2d')!;
    if (this.visiblePage.dirty) {
      const imageData = this.visiblePage.getImageData(
          this.palette, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.putImageData(imageData, 0, 0);
      this.visiblePage.dirty = false;
    }
    this.drawCursor(ctx);
  }

  private drawCursor(ctx: CanvasRenderingContext2D) {
    if (this.cursorState === CursorState.HIDDEN) {
      return;
    }
    const x = (this.column - 1) * this.cellWidth;
    const y = (this.row - 1) * this.cellHeight;
    const getCursorRegion = () => {
      if (this.mode.mode === 0 && this.cursorState !== CursorState.SHOWN_INSERT) {
        return [x, y + this.cellHeight - 2, this.cellWidth - 1, 1];
      }
      if (this.cursorState === CursorState.SHOWN_INSERT) {
        return [x, y + this.cellHeight / 2, this.cellWidth - 1, this.cellHeight / 2];
      }
      return [x, y, this.cellWidth, this.cellHeight];
    };
    const [left, top, width, height] = getCursorRegion();
    const blinkOn = (performance.now() % 476) < 238;
    const palette = blinkOn ? this.palette.slice().reverse() : this.palette;
    const imageData = this.visiblePage.getImageData(palette, left, top, width, height);
    ctx.putImageData(imageData, left, top);
  }

  protected override newLine() {
    this.column = 1;
    this.row++;
    if (this.row == this.scrollEndRow) {
      this.activePage.scroll(this.scrollStartRow, this.scrollEndRow, this.color);
      this.row = this.scrollEndRow - 1;
      this.column = 1;
    }
  }

  override putChar(char: string) {
    this.activePage.putCharAt(this.row, this.column, {
      char, attributes: {...this.color}
    });
  }

  showCursor(insert: boolean) {
    this.cursorState = insert ? CursorState.SHOWN_INSERT : CursorState.SHOWN;
  }
  
  hideCursor() {
    this.cursorState = CursorState.HIDDEN;
  }

  moveCursor(dx: number) {
    if (this.activePage !== this.visiblePage) {
      return;
    }
    this.column += dx;
    while (this.column > this.width) {
      this.column -= this.width;
      this.row++;
    }
    while (this.column < 1) {
      this.column += this.width;
      this.row--;
    }
  }

  triggerPen(x: number, y: number): LightPenTrigger | undefined {
    if (x < 0 || y < 0 || x > this.canvas.width || y > this.canvas.height) {
      return;
    }
    const [row, column] = [
      1 + Math.floor(y / this.cellHeight),
      1 + Math.floor(x / this.cellWidth)
    ];
    const [left, top] = [(column - 1) * this.cellWidth, (row - 1) * this.cellHeight];
    const imageData = this.visiblePage.getImageData(
      this.palette, left, top, this.cellWidth, this.cellHeight);
    let dark = true;
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (imageData.data[i] > 0 || imageData.data[i + 1] > 0 || imageData.data[i + 2] > 0) {
        dark = false;
        break;
      }
    }
    return !dark ? { row, column, x: left, y: top } : undefined;
  }
}