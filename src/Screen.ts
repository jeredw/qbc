import { Color, cssForColorIndex, DEFAULT_PALETTE, egaIndexToColor, monoIndexToColor, vgaIndexToColor } from './Colors.ts';
import { CircleArgs, GetBitmapArgs, LineArgs, PaintArgs, Plotter, Point, PutBitmapArgs } from './Drawing.ts';
import { LightPenTarget, LightPenTrigger } from './LightPen.ts';
import { Printer, BasePrinter, StringPrinter } from './Printer.ts';
import { SCREEN_MODES, ScreenGeometry, ScreenMode } from './ScreenMode.ts';

export interface CanvasProvider {
  createCanvas(width: number, height: number): HTMLCanvasElement;
  cleanup?(): void;
}

class DefaultCanvasProvider implements CanvasProvider {
  createCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.className = 'screen screen-page';
    canvas.width = width;
    canvas.height = height;
    canvas.style.display = 'none';
    document.body.appendChild(canvas);
    return canvas;
  }

  cleanup() {
    for (const canvas of document.querySelectorAll('.screen-page')) {
      canvas.remove();
    }
  }
}

export interface Screen extends Printer, LightPenTarget {
  reset(): void;
  configure(modeNumber: number, colorSwitch: number, activePage: number, visiblePage: number): void;
  setTextGeometry(width?: number, height?: number): void;
  getMode(): ScreenMode;

  setColor(fgColor?: number, bgColor?: number, borderColor?: number): void;
  setFgColor(color: number): void;
  setPaletteEntry(attribute: number, color: number): void;
  resetPalette(): void;

  setDrawState(state: DrawState): void;
  getDrawState(): DrawState;
  setViewPrint(topRow: number, bottomRow: number): void;
  resetViewPrint(): void;
  setView(p1: Point, p2: Point, screen: boolean, color?: number, border?: number): void;
  resetView(): void;
  setWindow(p1: Point, p2: Point, screen: boolean): void;
  resetWindow(): void;
  viewToWindow(p: Point): Point;
  windowToView(p: Point): Point;
  screenToWindow(p: Point): Point;
  windowToScreen(p: Point): Point;
  getGraphicsCursor(): Point;
  setGraphicsCursor(p: Point): void;
  clear(): void;
  getPixel(x: number, y: number): number;
  setPixel(x: number, y: number, color?: number, step?: boolean): void;
  resetPixel(x: number, y: number, color?: number, step?: boolean): void;
  line(args: LineArgs, color?: number): void;
  circle(args: CircleArgs, color?: number): void;
  paint(args: PaintArgs, color?: number): void;
  getBitmap(args: GetBitmapArgs): ArrayBuffer;
  putBitmap(args: PutBitmapArgs): void;

  showCursor(): void;
  hideCursor(): void;
  moveCursor(dx: number): void;
  locateCursor(row?: number, column?: number): void;
  configureCursor(startScanline: number, endScanline: number, insert?: boolean): void;
  getRow(): number;
  getColumn(): number;
}

export interface DrawState {
  matrix: number[][];
  scale: number;
}

interface Attributes {
  fgColor: number;
  bgColor: number;
  blink?: boolean;
}

interface CharacterCell {
  char: string;
  attributes: Attributes;
}

class Page {
  dirty: boolean = true;
  canvas: HTMLCanvasElement;
  private text: CharacterCell[][];
  private cellWidth: number;
  private cellHeight: number;
  private mode: ScreenMode;
  private geometry: ScreenGeometry;
  private plotter: Plotter;

  constructor(mode: ScreenMode, geometry: ScreenGeometry, color: Attributes, canvasProvider: CanvasProvider) {
    this.mode = mode;
    this.geometry = geometry;
    const [width, height] = geometry.dots;
    [this.cellWidth, this.cellHeight] = geometry.characterBox;
    this.plotter = new Plotter(width, height);
    this.canvas = canvasProvider.createCanvas(width, height);
    // We'll be reading this back a ton so request cpu rendering.
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.font = `${this.cellHeight}px '${geometry.font}'`;
    ctx.textBaseline = 'top';
    this.clear(color);
  }

  setView(p1: Point, p2: Point, screen: boolean, color?: number, border?: number) {
    this.plotter.setClip(p1, p2);
    if (screen) {
      this.plotter.setView({x: 0, y: 0}, {x: this.geometry.dots[0] - 1, y: this.geometry.dots[1] - 1});
    } else {
      this.plotter.setView(p1, p2);
    }
    const ctx = this.canvas.getContext('2d')!;
    this.plotter.drawViewBox(ctx, p1, p2, color, border);
    this.dirty = true;
  }

  setWindow(p1: Point, p2: Point, screen: boolean) {
    this.plotter.setWindow(p1, p2, screen);
  }

  resetWindow() {
    this.plotter.resetWindow();
  }

  viewToWindow(p: Point): Point {
    return this.plotter.viewToWindow(p);
  }

  windowToView(p: Point): Point {
    return this.plotter.windowToView(p);
  }

  screenToWindow(p: Point): Point {
    return this.plotter.screenToWindow(p);
  }

  windowToScreen(p: Point): Point {
    return this.plotter.windowToScreen(p);
  }

  getGraphicsCursor(): Point {
    return {...this.plotter.cursor};
  }

  setGraphicsCursor(p: Point) {
    this.plotter.cursor = {...p};
  }

  clear(color: Attributes) {
    const [columns, rows] = this.geometry.text;
    this.text = new Array(rows);
    for (let y = 0; y < rows; y++) {
      this.text[y] = new Array(columns).fill({
        char: ' ',
        attributes: {...color}
      });
    }
    const ctx = this.canvas.getContext('2d')!;
    ctx.fillStyle = cssForColorIndex(color.bgColor);
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    this.dirty = true;
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

  getPixel(x: number, y: number): number {
    const ctx = this.canvas.getContext('2d')!;
    return this.plotter.getPixel(ctx, x, y);
  }

  setPixel(x: number, y: number, color: number, step?: boolean) {
    const ctx = this.canvas.getContext('2d')!;
    this.plotter.setPixel(ctx, x, y, color, step);
    this.dirty = true;
  }

  line(args: LineArgs, color: number) {
    const ctx = this.canvas.getContext('2d')!;
    this.plotter.line(ctx, args, color);
    this.dirty = true;
  }

  circle(args: CircleArgs, color: number) {
    const ctx = this.canvas.getContext('2d')!;
    const aspect = args.aspect ?? 4 * (this.geometry.dots[1] / this.geometry.dots[0]) / 3;
    this.plotter.circle(ctx, args, color, aspect);
    this.dirty = true;
  }

  paint(args: PaintArgs, color: number) {
    const ctx = this.canvas.getContext('2d')!;
    this.plotter.paint(ctx, args, color);
    this.dirty = true;
  }

  getBitmap(args: GetBitmapArgs): ArrayBuffer {
    const ctx = this.canvas.getContext('2d')!;
    const {bppPerPlane, planes} = this.mode;
    return this.plotter.getBitmap(ctx, args, bppPerPlane, planes);
  }

  putBitmap(args: PutBitmapArgs) {
    const ctx = this.canvas.getContext('2d')!;
    const {bppPerPlane, planes} = this.mode;
    this.plotter.putBitmap(ctx, args, bppPerPlane, planes);
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

  getImageData(palette: Color[], left: number, top: number, width: number, height: number, xorIndex: number = 0): ImageData {
    const ctx = this.canvas.getContext('2d')!;
    const colorIndices = ctx.getImageData(left, top, width, height);
    const output = ctx.createImageData(colorIndices);
    let index = 0;
    for (let y = 0; y < colorIndices.height; y++) {
      for (let x = 0; x < colorIndices.width; x++) {
        const paletteIndex = colorIndices.data[index];
        const color = palette[paletteIndex ^ xorIndex];
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
    for (let row = startRow; row < endRow && row < this.text.length; row++) {
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

export class CanvasScreen extends BasePrinter implements Screen {
  private mode: ScreenMode;
  private geometry: ScreenGeometry;
  private color: Attributes;
  private scrollStartRow: number;
  // Text scrolls up when a newline would first enter this row, e.g. for a 25
  // line screen we would scroll up when entering notional line 26.
  private scrollEndRow: number;
  private cursorShown: boolean = false;
  private cursorStartScanline: number = 0;
  private cursorEndScanline: number = 31;
  private cellWidth: number;
  private cellHeight: number;
  private pages: Page[];
  private activePage: Page;
  private visiblePage: Page;
  private palette: Color[];
  private canvasProvider: CanvasProvider;
  private headless?: boolean;
  private drawState: DrawState;
  canvas: HTMLCanvasElement;

  constructor(canvasProvider?: CanvasProvider) {
    super(0);
    this.canvasProvider = canvasProvider ?? new DefaultCanvasProvider();
    this.headless = !!canvasProvider;
    this.drawState = {
      matrix: [[1, 0], [0, 1]],
      scale: 4,
    };
    this.configure(0, 0, 0, 0);
  }

  reset() {
    this.drawState = {
      matrix: [[1, 0], [0, 1]],
      scale: 4,
    };
    this.configure(1, 0, 0, 0);
    this.configure(0, 0, 0, 0);
  }

  configure(modeNumber: number, colorSwitch: number, activePage: number, visiblePage: number) {
    const mode = SCREEN_MODES.find((entry) => entry.mode === modeNumber);
    if (!mode) {
      throw new Error(`invalid screen mode ${modeNumber}`);
    }
    const geometry = mode.geometry[0];
    this.setScreenMode(mode, geometry, colorSwitch, activePage, visiblePage);
  }

  setTextGeometry(width?: number, height?: number) {
    const [currentWidth, currentHeight] = this.geometry.text;
    const desiredWidth = width ?? currentWidth;
    const desiredHeight = height ?? currentHeight;
    const geometry = this.mode.geometry.find((entry) => (
      entry.text[0] === desiredWidth && entry.text[1] === desiredHeight
    ));
    if (!geometry) {
      throw new Error(`unsupported text geometry ${width}x${height}`);
    }
    this.setScreenMode(this.mode, geometry, 0, 0, 0);
  }

  private setScreenMode(mode: ScreenMode, geometry: ScreenGeometry, colorSwitch: number, activePage: number, visiblePage: number) {
    if (activePage < 0 || activePage >= mode.pages) {
      throw new Error(`invalid active page ${activePage}`);
    }
    if (visiblePage < 0 || visiblePage >= mode.pages) {
      throw new Error(`invalid visible page ${visiblePage}`);
    }
    if (this.mode === mode && geometry == this.geometry) {
      // Same mode and geometry means we want to switch pages.
      this.activePage = this.pages[activePage];
      this.visiblePage = this.pages[visiblePage];
      this.visiblePage.dirty = true;
      this.resetPalette();
      if (this.canvas) {
        const ctx = this.canvas.getContext('2d')!
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      }
      return;
    }
    this.mode = mode;
    if (mode.mode === 0) {
      this.cursorStartScanline = 15;
      this.cursorEndScanline = 16;
    }
    this.resetPalette();
    this.geometry = geometry;
    this.width = geometry.text[0];
    this.column = 1;
    this.row = 1;
    this.resetViewPrint();
    this.color = {fgColor: mode.defaultFgColor, bgColor: 0};
    [this.cellWidth, this.cellHeight] = geometry.characterBox;
    this.canvasProvider.cleanup?.();
    this.pages = [];
    for (let i = 0; i < mode.pages; i++) {
      this.pages[i] = new Page(mode, geometry, this.color, this.canvasProvider);
    }
    this.activePage = this.pages[activePage];
    this.visiblePage = this.pages[visiblePage];
    if (this.headless) {
      return;
    }
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'screen';
      this.canvas.setAttribute('tabindex', '1');
    } else {
      this.canvas.style.transform = '';
    }
    this.canvas.width = geometry.dots[0];
    this.canvas.height = geometry.dots[1];
    const [scaleX, scaleY] = [640 / this.canvas.width, 480 / this.canvas.height];
    this.canvas.style.transform = `scale(${scaleX}, ${scaleY})`;
    const ctx = this.canvas.getContext('2d')!
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  getMode(): ScreenMode {
    return this.mode;
  }

  setColor(fgColor?: number, bgColor?: number, borderColor?: number) {
    const screenMode = this.mode.mode;
    if (screenMode === 2) {
      throw new Error('color is not supported');
    }
    const borderColorOk = borderColor === undefined ||
      screenMode === 0 && (borderColor >= 0 && borderColor <= 15);
    if (!borderColorOk) {
      throw new Error('invalid border color');
    }
    const bgColorOk = bgColor === undefined ||
      screenMode === 0 && (bgColor >= 0 && bgColor < this.mode.attributes) ||
      screenMode === 1 && (bgColor >= 0 && bgColor <= 255) ||
      (screenMode >= 7 && screenMode <= 10) && (bgColor >= 0 && bgColor < this.mode.colors);
    if (!bgColorOk) {
      throw new Error('invalid background color');
    }
    const fgColorOk = fgColor === undefined ||
      screenMode === 0 && (fgColor >= 0 && fgColor <= 31) ||
      screenMode !== 1 && (fgColor >= 0 && fgColor < this.mode.attributes);
    if (!fgColorOk) {
      throw new Error('invalid foreground color');
    }
    if (fgColor !== undefined) {
      if (screenMode === 0) {
        this.color.fgColor = fgColor & 15;
        if (fgColor > 15) {
          this.color.blink = true;
        }
      } else {
        this.color.fgColor = fgColor;
      }
    }
    if (bgColor !== undefined) {
      if (screenMode === 0) {
        // In mode 0, bgcolor can only take low intensity colors.
        this.color.bgColor = bgColor & 7;
      }
      if (screenMode === 1) {
        this.setPaletteEntry(0, bgColor & 15);
      }
      if (screenMode >= 7 && screenMode <= 10) {
        this.setPaletteEntry(0, bgColor);
      }
    }
  }

  setFgColor(color: number) {
    this.color.fgColor = color;
  }

  setPaletteEntry(attribute: number, color: number) {
    if (attribute < 0 || attribute >= this.mode.attributes) {
      throw new Error('invalid attribute');
    }
    if (color < 0 || color >= this.mode.colors) {
      throw new Error('invalid color');
    }
    const screenMode = this.mode.mode;
    if (screenMode === 0 || screenMode === 9) {
      this.palette[attribute] = egaIndexToColor(color);
    } else if (screenMode < 10) {
      this.palette[attribute] = DEFAULT_PALETTE[color];
    } else if (screenMode === 10) {
      // Odd attributes can't be remapped for some reason.
      if (attribute !== 1 && attribute !== 3) {
        this.palette[attribute] = monoIndexToColor(color);
      }
    } else {
      this.palette[attribute] = vgaIndexToColor(color);
    }
    this.visiblePage.dirty = true;
  }

  resetPalette() {
    const screenMode = this.mode.mode;
    this.palette = [...DEFAULT_PALETTE];
    if (screenMode === 1) {
      this.palette[1] = DEFAULT_PALETTE[11];
      this.palette[2] = DEFAULT_PALETTE[13];
      this.palette[3] = DEFAULT_PALETTE[15];
    } else if (screenMode === 2 || screenMode === 11) {
      this.palette[1] = DEFAULT_PALETTE[15];
    } else if (screenMode === 10) {
      this.palette[1] = monoIndexToColor(3);
      this.palette[2] = monoIndexToColor(6);
      this.palette[3] = monoIndexToColor(8);
    }
  }

  setDrawState(state: DrawState): void {
    this.drawState = {...state};
  }

  getDrawState(): DrawState {
    return this.drawState;
  }

  setViewPrint(topRow: number, bottomRow: number) {
    const [_, rows] = this.geometry.text;
    if (topRow < 1 || topRow > rows) {
      throw new Error(`invalid top row: ${topRow}`);
    }
    if (bottomRow < 1 || bottomRow > rows) {
      throw new Error(`invalid bottom row: ${bottomRow}`);
    }
    if (topRow > bottomRow) {
      throw new Error('top row must be above bottom row');
    }
    this.scrollStartRow = topRow;
    this.scrollEndRow = bottomRow + 1;
    this.row = topRow;
    this.column = 1;
  }

  resetViewPrint() {
    this.scrollStartRow = 1;
    this.scrollEndRow = this.geometry.text[1];
    this.row = 1;
    this.column = 1;
  }

  setView(p1: Point, p2: Point, screen: boolean, color?: number, border?: number) {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    if (p1.x === p2.x || p1.y === p2.y) {
      throw new Error('invalid view');
    }
    this.activePage.setView(p1, p2, screen, color, border);
  }

  resetView() {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    this.activePage.setView({x: 0, y: 0}, {x: this.geometry.dots[0] - 1, y: this.geometry.dots[1] - 1}, true);
  }

  setWindow(p1: Point, p2: Point, screen: boolean) {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    if (p1.x === p2.x || p1.y === p2.y) {
      throw new Error('invalid window');
    }
    this.activePage.setWindow(p1, p2, screen);
  }

  resetWindow() {
    this.activePage.resetWindow();
  }

  viewToWindow(p: Point): Point {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    return this.activePage.viewToWindow(p);
  }

  windowToView(p: Point): Point {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    return this.activePage.windowToView(p);
  }

  screenToWindow(p: Point): Point {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    return this.activePage.screenToWindow(p);
  }

  windowToScreen(p: Point): Point {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    return this.activePage.windowToScreen(p);
  }

  getGraphicsCursor(): Point {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    return this.activePage.getGraphicsCursor();
  }

  setGraphicsCursor(p: Point) {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    return this.activePage.setGraphicsCursor(p);
  }

  clear() {
    this.activePage.clear(this.color);
    this.column = 1;
    this.row = 1;
  }

  getPixel(x: number, y: number): number {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    return this.activePage.getPixel(x, y);
  }

  setPixel(x: number, y: number, color?: number, step?: boolean) {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    this.activePage.setPixel(x, y, this.checkColorArg(color, this.color.fgColor), step);
  }

  resetPixel(x: number, y: number, color?: number, step?: boolean) {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    this.activePage.setPixel(x, y, this.checkColorArg(color, this.color.bgColor), step);
  }

  line(args: LineArgs, color?: number) {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    this.activePage.line(args, this.checkColorArg(color, this.color.fgColor));
  }

  circle(args: CircleArgs, color?: number) {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    this.activePage.circle(args, this.checkColorArg(color, this.color.fgColor));
  }

  paint(args: PaintArgs, color?: number) {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    this.activePage.paint(args, this.checkColorArg(color, this.color.fgColor));
  }

  private checkColorArg(color: number | undefined, defaultColor: number): number {
    if (color === undefined) {
      return defaultColor;
    }
    if (color < 0 || color >= this.mode.attributes) {
      return this.mode.attributes - 1;
    }
    return color;
  }

  getBitmap(args: GetBitmapArgs): ArrayBuffer {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    return this.activePage.getBitmap(args);
  };

  putBitmap(args: PutBitmapArgs) {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    this.activePage.putBitmap(args);
  }

  render() {
    const ctx = this.canvas.getContext('2d')!;
    if (this.visiblePage.dirty) {
      // TODO: replace this with a pixel shader
      const imageData = this.visiblePage.getImageData(
          this.palette, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.putImageData(imageData, 0, 0);
      this.visiblePage.dirty = false;
    }
    this.drawCursor(ctx);
  }

  // Used for tests to map colors to the current palette and dump canvas.
  renderVisiblePage(): HTMLCanvasElement {
    const ctx = this.visiblePage.canvas.getContext('2d')!;
    const imageData = this.visiblePage.getImageData(
        this.palette, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.putImageData(imageData, 0, 0);
    return this.visiblePage.canvas;
  }

  private drawCursor(ctx: CanvasRenderingContext2D) {
    if (!this.cursorShown) {
      return;
    }
    const x = (this.column - 1) * this.cellWidth;
    const y = (this.row - 1) * this.cellHeight;
    const getCursorRegion = () => {
      const start = clamp(this.cursorStartScanline, 0, this.cellHeight - 1);
      const end = clamp(this.cursorEndScanline, 0, this.cellHeight - 1);
      if (end < start) {
        // In some bioses this creates split cursors but we just show a full height cursor in this case.
        return [x, y, this.cellWidth - 1, this.cellHeight - 1];
      }
      return [x, y + start, this.cellWidth - 1, (end - start) + 1];
    };
    const [left, top, width, height] = getCursorRegion();
    let blinkOn: boolean;
    let cursorColor: number;
    if (this.mode.mode === 0) {
      const char = this.visiblePage.getCharAt(this.row, this.column);
      blinkOn = (performance.now() % 476) < 238;
      cursorColor = blinkOn ? char.attributes.fgColor : char.attributes.bgColor;
    } else {
      blinkOn = true;
      cursorColor = this.color.fgColor;
    }
    const imageData = this.visiblePage.getImageData(this.palette, left, top, width, height, cursorColor);
    ctx.putImageData(imageData, left, top);
  }

  private eraseCursor() {
    if (this.headless) {
      return;
    }
    const ctx = this.canvas.getContext('2d')!;
    const x = (this.column - 1) * this.cellWidth;
    const y = (this.row - 1) * this.cellHeight;
    const imageData = this.visiblePage.getImageData(this.palette, x, y, this.cellWidth, this.cellHeight);
    ctx.putImageData(imageData, x, y);
  }

  override newLine() {
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

  showCursor() {
    this.eraseCursor();
    this.cursorShown = true;
  }
  
  hideCursor() {
    this.eraseCursor();
    this.cursorShown = false;
  }

  moveCursor(dx: number) {
    if (this.activePage !== this.visiblePage) {
      return;
    }
    this.eraseCursor();
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

  locateCursor(row?: number, column?: number) {
    if (row !== undefined) {
      if (row < this.scrollStartRow || row > this.scrollEndRow) {
        throw new Error('invalid row');
      }
      this.row = row;
    }
    if (column !== undefined) {
      if (column < 1 || column > this.width) {
        throw new Error('invalid column');
      }
      this.column = column;
    }
  }

  configureCursor(startScanline: number, endScanline: number, insert?: boolean) {
    if (insert !== undefined) {
      this.cursorStartScanline = this.mode.mode === 0 ?
        (insert ? this.cellHeight / 2 : this.cellHeight - 2) :
        (insert ? this.cellHeight / 2 : 0);
      this.cursorEndScanline = this.mode.mode === 0 && !insert ?
        this.cellHeight - 2 : this.cellHeight - 1;
      return;
    }
    if (startScanline < 0 || startScanline > 31) {
      throw new Error('invalid start scanline');
    }
    if (endScanline < 0 || endScanline > 31) {
      throw new Error('invalid end scanline');
    }
    this.cursorStartScanline = startScanline;
    this.cursorEndScanline = endScanline;
  }

  getRow(): number {
    return this.row;
  }

  getColumn(): number {
    return this.column;
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

export class TestScreen implements Screen {
  text: StringPrinter;
  graphics: CanvasScreen;
  hasGraphics: boolean;

  constructor(canvasProvider: CanvasProvider) {
    this.text = new StringPrinter();
    this.graphics = new CanvasScreen(canvasProvider);
    this.hasGraphics = false;
  }

  renderVisiblePage(): HTMLCanvasElement {
    return this.graphics.renderVisiblePage();
  }

  reset() {
  }

  setTextGeometry(width?: number, height?: number) {
    this.text.print(`[WIDTH ${width}, ${height}]`, true);
    this.graphics.setTextGeometry(width, height);
    if (width !== undefined) {
      this.text.setWidth(width);
    }
    this.hasGraphics = true;
  }

  setWidth(columns: number) {
    this.text.print(`[WIDTH ${columns}]`, true);
    this.text.setWidth(columns);
  }

  configure(modeNumber: number, colorSwitch: number, activePage: number, visiblePage: number) {
    this.text.print(`[SCREEN ${modeNumber}, ${colorSwitch}, ${activePage}, ${visiblePage}]`, true);
    this.graphics.configure(modeNumber, colorSwitch, activePage, visiblePage);
    this.hasGraphics = true;
  }

  getMode(): ScreenMode {
    return this.graphics.getMode();
  }

  setColor(fgColor?: number, bgColor?: number, borderColor?: number) {
    this.text.print(`[COLOR ${fgColor}, ${bgColor}, ${borderColor}]`, true);
    this.graphics.setColor(fgColor, bgColor, borderColor);
    this.hasGraphics = true;
  }

  setFgColor(color: number) {
    this.text.print(`[setFgColor ${color}]`, true);
    this.graphics.setFgColor(color);
    this.hasGraphics = true;
  }

  setPaletteEntry(attribute: number, color: number) {
    this.text.print(`[PALETTE ${attribute}, ${color}]`, true);
    this.graphics.setPaletteEntry(attribute, color);
    this.hasGraphics = true;
  }

  resetPalette() {
    this.text.print(`[PALETTE]`, true);
    this.graphics.resetPalette();
    this.hasGraphics = true;
  }

  setDrawState(state: DrawState) {
    this.hasGraphics = true;
    return this.graphics.setDrawState(state);
  }

  getDrawState(): DrawState {
    this.hasGraphics = true;
    return this.graphics.getDrawState();
  }

  setViewPrint(topRow: number, bottomRow: number) {
    this.text.print(`[VIEW PRINT ${topRow}, ${bottomRow}]`, true);
    this.graphics.setViewPrint(topRow, bottomRow);
    this.hasGraphics = true;
  }

  resetViewPrint() {
    this.text.print(`[VIEW PRINT]`, true);
    this.graphics.resetViewPrint();
  }

  setView(p1: Point, p2: Point, screen: boolean, color?: number, border?: number) {
    this.text.print(`[VIEW ${p1.x}, ${p1.y}, ${p2.x}, ${p2.y}, ${screen}, ${color}, ${border}]`, true);
    this.graphics.setView(p1, p2, screen, color, border);
  }

  resetView() {
    this.text.print(`[VIEW]`, true);
    this.graphics.resetView();
  }

  setWindow(p1: Point, p2: Point, screen: boolean) {
    this.text.print(`[WINDOW ${p1.x}, ${p1.y}, ${p2.x}, ${p2.y}, ${screen}]`, true);
    this.graphics.setWindow(p1, p2, screen);
  }

  resetWindow() {
    this.text.print(`[WINDOW]`, true);
    this.graphics.resetWindow();
  }

  windowToView(p: Point): Point {
    this.text.print(`[PMAP ${p.x}, ${p.y}]`, true);
    return this.graphics.windowToView(p);
  }

  viewToWindow(p: Point): Point {
    this.text.print(`[PMAP ${p.x}, ${p.y}]`, true);
    return this.graphics.viewToWindow(p);
  }

  windowToScreen(p: Point): Point {
    this.text.print(`[windowToScreen ${p.x}, ${p.y}]`, true);
    return this.graphics.windowToScreen(p);
  }

  screenToWindow(p: Point): Point {
    this.text.print(`[screenToWindow ${p.x}, ${p.y}]`, true);
    return this.graphics.screenToWindow(p);
  }

  getGraphicsCursor(): Point {
    this.text.print(`[POINT]`, true);
    return this.graphics.getGraphicsCursor();
  }

  setGraphicsCursor(p: Point) {
    this.text.print(`[setGraphicsCursor ${p.x}, ${p.y}]`, true);
    this.graphics.setGraphicsCursor(p);
  }

  clear() {
    this.text.print(`[CLS]`, true);
    this.graphics.clear();
  }

  getPixel(x: number, y: number): number {
    this.text.print(`[POINT ${x}, ${y}]`, true);
    return this.graphics.getPixel(x, y);
  }

  setPixel(x: number, y: number, color?: number, step?: boolean) {
    this.text.print(`[PSET ${x}, ${y}, ${color}, ${step}]`, true);
    this.graphics.setPixel(x, y, color, step);
  }

  resetPixel(x: number, y: number, color?: number, step?: boolean) {
    this.text.print(`[PRESET ${x}, ${y}, ${color}, ${step}]`, true);
    this.graphics.resetPixel(x, y, color, step);
  }

  line(args: LineArgs, color?: number) {
    this.text.print(`[LINE ${args.step1}, ${args.x1}, ${args.y1}, ${args.step2}, ${args.x2}, ${args.y2}, ${args.outline}, ${args.fill}, ${args.dash}, ${color}]`, true);
    this.graphics.line(args, color);
  }

  circle(args: CircleArgs, color?: number) {
    this.text.print(`[CIRCLE ${args.step}, ${args.x}, ${args.y}, ${args.radius}, ${args.start}, ${args.end}, ${args.aspect}, ${color}]`, true);
    this.graphics.circle(args, color);
  }

  paint(args: PaintArgs, color?: number) {
    this.text.print(`[PAINT ${args.step}, ${args.x}, ${args.y}, ${args.tile}, ${args.borderColor}, ${args.background}, ${color}]`, true);
    this.graphics.paint(args, color);
  }

  getBitmap(args: GetBitmapArgs): ArrayBuffer {
    this.text.print(`[GET ${args.step1}, ${args.x1}, ${args.y1}, ${args.step2}, ${args.x2}, ${args.y2}]`, true);
    return this.graphics.getBitmap(args);
  }

  putBitmap(args: PutBitmapArgs) {
    this.text.print(`[PUT ${args.step}, ${args.x1}, ${args.y1}, ${args.operation}]`, true);
    this.graphics.putBitmap(args);
  }

  showCursor() {
    this.graphics.showCursor();
  }

  hideCursor() {
    this.text.print('□', false);
    this.graphics.hideCursor();
  }

  moveCursor(dx: number) {
    this.text.print((dx < 0 ? '←' : '→').repeat(Math.abs(dx)), false);
    this.graphics.moveCursor(dx);
  }

  locateCursor(row?: number, column?: number) {
    this.text.print(`[LOCATE ${row}, ${column}]`, true);
    this.graphics.locateCursor(row, column);
  }

  configureCursor(startScanline: number, endScanline: number, insert?: boolean) {
    if (insert !== undefined) {
      this.text.print(insert ? '■' : '␣', false);
    } else {
      this.text.print(`[LOCATE ,,, ${startScanline}, ${endScanline}]`, true);
    }
    this.graphics.configureCursor(startScanline, endScanline);
  }

  getRow(): number {
    return this.graphics.getRow();
  }

  getColumn(): number {
    return this.graphics.getColumn();
  }

  print(text: string, newline: boolean) {
    this.text.print(text, newline);
    if (this.hasGraphics) {
      this.graphics.print(text, newline);
    }
  }

  space(numSpaces: number) {
    this.text.space(numSpaces);
    if (this.hasGraphics) {
      this.graphics.space(numSpaces);
    }
  }

  tab(targetColumn?: number) {
    this.text.tab(targetColumn);
    if (this.hasGraphics) {
      this.graphics.tab(targetColumn);
    }
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

function clamp(x: number, min: number, max: number): number {
  if (x < min) {
    return min;
  }
  if (x > max) {
    return max;
  }
  return x;
}