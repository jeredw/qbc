import { asciiToChar, showControlChar } from './AsciiChart.ts';
import { Color, cssForColorIndex, DEFAULT_PALETTE, egaIndexToColor, monoIndexToColor, vgaIndexToColor } from './Colors.ts';
import { CircleArgs, GetBitmapArgs, LineArgs, PaintArgs, Plotter, Point, PutBitmapArgs } from './Drawing.ts';
import { LightPenTarget, LightPenTrigger } from './LightPen.ts';
import { clamp } from './Math.ts';
import { MouseSurface } from './Mouse.ts';
import { Printer, BasePrinter, TestPrinter } from './Printer.ts';
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

export interface Screen extends Printer, LightPenTarget, MouseSurface {
  reset(): void;
  configure(modeNumber?: number, colorSwitch?: number, activePage?: number, visiblePage?: number): void;
  setTextGeometry(width?: number, height?: number): void;
  getMode(): ScreenMode;
  getGeometry(): ScreenGeometry;
  copyPage(sourcePage: number, destPage: number): void;

  setColor(fgColor?: number, bgColor?: number, borderColor?: number): void;
  setPaletteEntry(attribute: number, color: number): void;
  resetPalette(): void;
  setVgaPaletteIndex(index: number): void;
  setVgaPaletteData(data: number): void;
  getVgaPaletteData(): number;
  setExtraFrameBufferData(data: Uint8Array): void;
  getExtraFrameBufferData(): Uint8Array;

  setDrawState(state: DrawState): void;
  getDrawState(): DrawState;
  setViewPrint(topRow: number, bottomRow: number): void;
  resetViewPrint(fullscreen: boolean): void;
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
  clear(options?: number): void;
  getPixel(x: number, y: number, screen?: boolean): number;
  setPixel(x: number, y: number, color?: number, step?: boolean, screen?: boolean): void;
  resetPixel(x: number, y: number, color?: number, step?: boolean): void;
  line(args: LineArgs, color?: number): void;
  circle(args: CircleArgs, color?: number): void;
  paint(args: PaintArgs, color?: number): void;
  getBitmap(args: GetBitmapArgs): Uint8Array;
  putBitmap(args: PutBitmapArgs): void;

  showTextCursor(): void;
  hideTextCursor(): void;
  moveTextCursor(dx: number): void;
  locateTextCursor(row?: number, column?: number): void;
  configureTextCursor(startScanline: number, endScanline: number, insert?: boolean): void;

  getRow(): number;
  getColumn(): number;
  getCharAt(row: number, column: number): string;
  getColorAt(row: number, column: number): number;
  getAttributeAt(row: number, column: number): number;
  setCharAt(row: number, column: number, char: string): void;
  setAttributeAt(row: number, column: number, attribute: number): void;
  recognizeCharAt(row: number, column: number): string;
  setSoftKey(key: number, name: string): void;
  showSoftKeys(): void;
  hideSoftKeys(): void;
}

export interface DrawState {
  matrix: number[][];
  scale: number;
  color: number;
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

function emptyCell(color: Attributes): CharacterCell {
  return {char: ' ', attributes: {...color}};
}

class Page {
  dirty: boolean = true;
  canvas: HTMLCanvasElement;
  viewSet: boolean;
  protected text: CharacterCell[][];
  private cellWidth: number;
  private cellHeight: number;
  private mode: ScreenMode;
  private geometry: ScreenGeometry;
  private plotter: Plotter;
  private cachedImageData?: ImageData;
  private ctx: CanvasRenderingContext2D;

  constructor(mode: ScreenMode, geometry: ScreenGeometry, color: Attributes, canvasProvider: CanvasProvider) {
    this.mode = mode;
    this.geometry = geometry;
    const [width, height] = geometry.dots;
    [this.cellWidth, this.cellHeight] = geometry.characterBox;
    this.plotter = new Plotter(width, height);
    this.canvas = canvasProvider.createCanvas(width, height);
    // We'll be reading this back a ton so request cpu rendering.
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.ctx.font = `${this.cellHeight}px '${geometry.font}'`;
    this.ctx.textBaseline = 'top';
    this.initText(color);
    this.clearGraphics(color);
    this.viewSet = false;
    this.cachedImageData = undefined;
  }

  reset() {
    this.cachedImageData = undefined;
    const [width, height] = this.geometry.dots;
    this.plotter.reset(width, height);
    this.viewSet = false;
  }

  setView(p1: Point, p2: Point, screen: boolean, color?: number, border?: number) {
    this.cachedImageData = undefined;
    this.viewSet = true;
    this.plotter.setClip(p1, p2);
    if (screen) {
      this.plotter.setView({x: 0, y: 0}, {x: this.geometry.dots[0] - 1, y: this.geometry.dots[1] - 1});
    } else {
      this.plotter.setView(p1, p2);
    }
    this.plotter.drawViewBox(this.ctx, p1, p2, color, border);
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

  resetGraphicsCursor() {
    this.plotter.resetCursor();
  }

  private initText(color: Attributes) {
    const [columns, rows] = this.geometry.text;
    this.text = Array.from(Array(rows), () => Array.from(Array(columns), () => emptyCell(color)));
  }

  private clearTextRow(y: number, color: Attributes) {
    const [columns, _] = this.geometry.text;
    this.text[y] = Array.from(Array(columns), () => emptyCell(color));
  }

  clearText(color: Attributes, startRow?: number, endRow?: number) {
    this.cachedImageData = undefined;
    const [_, rows] = this.geometry.text;
    startRow = startRow ?? 1;
    endRow = endRow ?? rows;
    for (let y = startRow - 1; y <= endRow - 1; y++) {
      this.clearTextRow(y, color);
    }
    this.ctx.fillStyle = cssForColorIndex(color.bgColor);
    const y = this.cellHeight * (startRow - 1);
    const height = this.cellHeight * (1 + endRow - startRow);
    this.ctx.fillRect(0, y, this.ctx.canvas.width, height);
    this.dirty = true;
  }

  clearGraphics(color: Attributes) {
    this.cachedImageData = undefined;
    this.plotter.clearView(this.ctx, color.bgColor);
    this.dirty = true;
  }

  getCharAt(row: number, col: number): CharacterCell {
    return this.text[row - 1][col - 1];
  }

  putCharAt(row: number, col: number, char: CharacterCell) {
    this.text[row - 1][col - 1] = char;
    this.drawCell(row, col);
    this.dirty = true;
  }

  recognizeCharAt(row: number, column: number, fontHash: Map<string, string>): string {
    const left = (column - 1) * this.cellWidth;
    const top = (row - 1) * this.cellHeight;
    const bitmap = this.ctx.getImageData(left, top, this.cellWidth, this.cellHeight);
    return fontHash.get(hashCharacterCellBitmap(bitmap)) ?? ' ';
  }

  getPixel(x: number, y: number, screen?: boolean): number {
    if (!this.cachedImageData) {
      this.cachedImageData = this.ctx.getImageData(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    }
    return this.plotter.getPixel(this.ctx, x, y, screen, this.cachedImageData);
  }

  setPixel(x: number, y: number, color: number, step?: boolean, screen?: boolean) {
    this.plotter.setPixel(this.ctx, x, y, color, step, screen, this.cachedImageData);
    this.dirty = true;
  }

  line(args: LineArgs, color: number) {
    this.cachedImageData = undefined;
    this.plotter.line(this.ctx, args, color);
    this.dirty = true;
  }

  circle(args: CircleArgs, color: number) {
    this.cachedImageData = undefined;
    const aspect = args.aspect ?? 4 * (this.geometry.dots[1] / this.geometry.dots[0]) / 3;
    this.plotter.circle(this.ctx, args, color, aspect);
    this.dirty = true;
  }

  paint(args: PaintArgs, color: number) {
    this.cachedImageData = undefined;
    const {bppPerPlane, planes} = this.mode;
    this.plotter.paint(this.ctx, args, color, bppPerPlane, planes);
    this.dirty = true;
  }

  getBitmap(args: GetBitmapArgs): Uint8Array {
    const {bppPerPlane, planes} = this.mode;
    return this.plotter.getBitmap(this.ctx, args, bppPerPlane, planes);
  }

  putBitmap(args: PutBitmapArgs) {
    this.cachedImageData = undefined;
    const {bppPerPlane, planes} = this.mode;
    this.plotter.putBitmap(this.ctx, args, bppPerPlane, planes);
    this.dirty = true;
  }

  private drawCell(row: number, col: number) {
    this.cachedImageData = undefined;
    const x = (col - 1) * this.cellWidth;
    const y = (row - 1) * this.cellHeight;
    const cell = this.getCharAt(row, col);
    this.ctx.fillStyle = cssForColorIndex(cell.attributes.bgColor);
    this.ctx.fillRect(x, y, this.cellWidth, this.cellHeight);
    this.ctx.fillStyle = cssForColorIndex(cell.attributes.fgColor);
    this.ctx.fillText(cell.char, x, y);
    this.dirty = true;
  }

  getImageData(palette: Color[], left: number, top: number, width: number, height: number, xorIndex: number = 0): ImageData {
    const colorIndices = this.ctx.getImageData(left, top, width, height);
    const output = this.ctx.createImageData(colorIndices);
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

  copyFrom(other: Page) {
    this.cachedImageData = undefined;
    const otherCtx = other.canvas.getContext('2d')!;
    const imageData = otherCtx.getImageData(0, 0, other.canvas.width, other.canvas.height);
    this.ctx.putImageData(imageData, 0, 0);
    this.text = [];
    for (const otherRow of other.text) {
      const row: CharacterCell[] = [];
      for (const cell of otherRow) {
        row.push({...cell});
      }
      this.text.push(row);
    }
    this.dirty = true;
  }

  scroll(startRow: number, endRow: number, color: Attributes) {
    this.cachedImageData = undefined;
    for (let row = startRow; row < endRow && row < this.text.length; row++) {
      this.text[row - 1] = this.text[row].slice();
    }
    if (endRow > startRow) {
      const top = startRow * this.cellHeight;
      const height = endRow * this.cellHeight - top;
      const text = this.ctx.getImageData(0, top, this.ctx.canvas.width, height);
      this.ctx.putImageData(text, 0, top - this.cellHeight);
      this.clearTextRow(endRow - 2, color);
      for (let i = 0; i < this.text[endRow - 2].length; i++) {
        this.drawCell(endRow - 1, 1 + i);
      }
      this.dirty = true;
    }
  }
}

interface SoftKeys {
  keys: string[];
  visible: boolean;
}

export class CanvasScreen extends BasePrinter implements Screen {
  private mode: ScreenMode;
  private geometry: ScreenGeometry;
  private color: Attributes;
  private scrollStartRow: number;
  // scrollEndRow is 1 + last line of the scroll region.
  // Text scrolls up when a newline would first enter this row, e.g. for a 25
  // line screen we would scroll up when entering notional line 26.
  private scrollEndRow: number;
  private textCursorShown: boolean = false;
  private cursorStartScanline: number = 0;
  private cursorEndScanline: number = 31;
  private mouseCursorShown: boolean = false;
  private mouseX: number = 0;
  private mouseY: number = 0;
  private cellWidth: number;
  private cellHeight: number;
  private pages: Page[];
  private activePage: Page;
  private visiblePage: Page;
  private activePageIndex = 0;
  private visiblePageIndex = 0;
  private palette: Color[];
  private canvasProvider: CanvasProvider;
  private headless?: boolean;
  private drawState: DrawState;
  private softKeys: SoftKeys;
  private vgaPaletteIndex: number;
  private vgaPaletteData: number[];
  private fontHash: Map<string, string>;
  private extraFrameBufferData: Uint8Array;
  canvas: HTMLCanvasElement;

  constructor(canvasProvider?: CanvasProvider) {
    super(0);
    this.canvasProvider = canvasProvider ?? new DefaultCanvasProvider();
    this.headless = !!canvasProvider;
    this.resetDrawState();
    this.vgaPaletteData = [];
    this.vgaPaletteIndex = 0;
    this.softKeys = {keys: [], visible: false};
    this.configure(0, 0, 0, 0);
  }

  reset() {
    this.resetDrawState();
    this.softKeys = {keys: [], visible: false};
    this.vgaPaletteData = [];
    this.vgaPaletteIndex = 0;
    this.extraFrameBufferData = new Uint8Array(1536);
    // Force mode 0 to reinitialize with default text geometry by first
    // switching to a mode that only supports 80x25.
    this.configure(2, 0, 0, 0);
    this.configure(0, 0, 0, 0);
  }

  private resetDrawState() {
    this.drawState = {
      matrix: [[1, 0], [0, 1]],
      scale: 4,
      color: 15,
    };
  }

  configure(modeNumber?: number, colorSwitch?: number, activePage?: number, visiblePage?: number) {
    const mode = modeNumber === undefined ? this.mode : SCREEN_MODES.find((entry) => entry.mode === modeNumber);
    if (!mode) {
      throw new Error(`invalid screen mode ${modeNumber}`);
    }
    // Only reset text geometry if the new mode does not support the current geometry.
    let matchingGeometry: ScreenGeometry | undefined;
    if (this.geometry) {
      const [columns, rows] = this.geometry.text;
      matchingGeometry = findTextGeometry(mode, columns, rows);
    }
    const geometry = matchingGeometry ?? mode.geometry[0];
    this.setScreenMode(mode, geometry, colorSwitch, activePage, visiblePage);
  }

  setTextGeometry(width?: number, height?: number) {
    const [currentWidth, currentHeight] = this.geometry.text;
    const desiredWidth = width ?? currentWidth;
    const desiredHeight = height ?? currentHeight;
    // If you say e.g. WIDTH 80 in SCREEN 13, instead of failing, QBasic
    // implicitly switches modes to mode 0.  Search forward through the list of
    // screen modes for a matching text geometry.
    let geometry: ScreenGeometry | undefined;
    let mode = this.mode;
    const modeIndex = SCREEN_MODES.findIndex((x) => x.mode === this.mode.mode);
    if (modeIndex === -1) {
      throw new Error('Invalid screen mode');
    }
    const numModes = SCREEN_MODES.length;
    for (let i = 0; i < numModes; i++) {
      mode = SCREEN_MODES[(modeIndex + i) % numModes];
      geometry = findTextGeometry(mode, desiredWidth, desiredHeight);
      if (geometry) {
        break;
      }
    }
    if (!geometry) {
      throw new Error(`Unsupported text geometry ${width}x${height}`);
    }
    this.setScreenMode(mode, geometry, 0, 0, 0);
  }

  private setScreenMode(mode: ScreenMode, geometry: ScreenGeometry, colorSwitch?: number, activePage?: number, visiblePage?: number) {
    if (activePage !== undefined && (activePage < 0 || activePage >= mode.pages)) {
      throw new Error(`invalid active page ${activePage}`);
    }
    if (visiblePage !== undefined && (visiblePage < 0 || visiblePage >= mode.pages)) {
      throw new Error(`invalid visible page ${visiblePage}`);
    }
    if (this.mode === mode && geometry == this.geometry) {
      if ((activePage === undefined || activePage === this.activePageIndex) &&
          (visiblePage === undefined || visiblePage === this.visiblePageIndex)) {
        // Do nothing if already configured as requested.
        return;
      }
      // Same mode and geometry means we want to switch pages.
      this.selectPages(activePage, visiblePage);
      this.resetPalette();
      for (const page of this.pages) {
        // Reset plotter state.
        page.reset();
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
    this.selectPages(activePage ?? 0, visiblePage ?? 0);
    this.buildFontHash();
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

  private selectPages(activePage?: number, visiblePage?: number) {
    if (activePage !== undefined) {
      this.activePageIndex = activePage;
      this.activePage = this.pages[activePage];
    }
    if (visiblePage !== undefined) {
      this.visiblePageIndex = visiblePage;
      this.visiblePage = this.pages[visiblePage];
      this.visiblePage.dirty = true;
    }
  }

  getMode(): ScreenMode {
    return this.mode;
  }

  getGeometry(): ScreenGeometry {
    return this.geometry;
  }

  copyPage(sourcePage: number, destPage: number) {
    if (sourcePage < 0 || sourcePage > this.pages.length) {
      throw new Error('source page is invalid');
    }
    if (destPage < 0 || destPage > this.pages.length) {
      throw new Error('dest page is invalid');
    }
    this.pages[destPage].copyFrom(this.pages[sourcePage]);
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

  setPaletteEntry(attribute: number, color: number) {
    if (attribute < 0 || attribute >= this.mode.attributes) {
      throw new Error('invalid attribute');
    }
    const screenMode = this.mode.mode;
    const isVgaMode = screenMode >= 11;
    if (color < 0 || (color >= this.mode.colors && !isVgaMode)) {
      throw new Error('invalid color');
    }
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
      // VGA only supports 6 bits per channel but colors are packed as 00rrrrrr
      // 00gggggg 00bbbbbb.
      if (color & 0xffc0c0c0) {
        throw new Error('invalid color');
      }
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

  setVgaPaletteIndex(index: number) {
    this.vgaPaletteIndex = index & 0xff;
  }

  setVgaPaletteData(data: number) {
    this.vgaPaletteData.push(data & 0x3f);
    if (this.vgaPaletteData.length === 3) {
      const [red, green, blue] = this.vgaPaletteData;
      const color = red | (green << 8) | (blue << 16);
      this.palette[this.vgaPaletteIndex] = vgaIndexToColor(color);
      this.vgaPaletteData = [];
      this.vgaPaletteIndex++;
      this.visiblePage.dirty = true;
    }
  }

  getVgaPaletteData(): number {
    if (this.vgaPaletteData.length === 0) {
      const color = this.palette[this.vgaPaletteIndex++];
      this.vgaPaletteData = [~~(color.red / 4), ~~(color.green / 4), ~~(color.blue / 4)];
    }
    return this.vgaPaletteData.pop() ?? 0;
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

  resetViewPrint(fullscreen = false) {
    this.scrollStartRow = 1;
    this.scrollEndRow = this.geometry.text[1] + (fullscreen ? 1 : 0);
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

  clear(options?: number) {
    switch (options) {
      case 0:
        this.activePage.clearText(this.color);
        if (this.mode.mode !== 0) {
          this.resetDrawState();
          this.activePage.clearGraphics(this.color);
          return;
        }
        break;
      case 1:
        if (this.mode.mode !== 0) {
          this.resetDrawState();
          this.activePage.clearGraphics(this.color);
          return;
        }
        break;
      case 2:
        this.activePage.clearText(this.color, this.scrollStartRow, this.scrollEndRow - 1);
        break;
      default:
        if (this.mode.mode === 0) {
          this.activePage.clearText(this.color, this.scrollStartRow, this.scrollEndRow - 1);
          const [_, rows] = this.geometry.text;
          if (!this.softKeys.visible) {
            this.activePage.clearText(this.color, rows, rows);
          } else {
            this.updateSoftKeyLine();
          }
        } else if (this.activePage.viewSet) {
          this.resetDrawState();
          this.activePage.clearGraphics(this.color);
          return;
        } else {
          this.resetDrawState();
          this.activePage.resetGraphicsCursor();
          this.activePage.clearText(this.color);
        }
        break;
    }
    this.row = this.scrollStartRow;
    this.column = 1;
  }

  getPixel(x: number, y: number, screen?: boolean): number {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    return this.activePage.getPixel(x, y, screen);
  }

  setPixel(x: number, y: number, color?: number, step?: boolean, screen?: boolean) {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    const drawColor = this.checkColorArg(color, this.color.fgColor);
    this.drawState.color = drawColor;
    this.activePage.setPixel(x, y, drawColor, step, screen);
  }

  resetPixel(x: number, y: number, color?: number, step?: boolean) {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    const drawColor = this.checkColorArg(color, this.color.bgColor);
    this.drawState.color = drawColor;
    this.activePage.setPixel(x, y, drawColor, step);
  }

  line(args: LineArgs, color?: number) {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    const drawColor = this.checkColorArg(color, this.color.fgColor);
    this.drawState.color = drawColor;
    this.activePage.line(args, drawColor);
  }

  circle(args: CircleArgs, color?: number) {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    const drawColor = this.checkColorArg(color, this.color.fgColor);
    this.drawState.color = drawColor;
    this.activePage.circle(args, drawColor);
  }

  paint(args: PaintArgs, color?: number) {
    if (this.mode.mode === 0) {
      throw new Error('unsupported screen mode');
    }
    const drawColor = this.checkColorArg(color, this.color.fgColor);
    this.drawState.color = drawColor;
    this.activePage.paint(args, drawColor);
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

  getBitmap(args: GetBitmapArgs): Uint8Array {
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

  setExtraFrameBufferData(data: Uint8Array): void {
    this.extraFrameBufferData.set(data, 0);
  }

  getExtraFrameBufferData(): Uint8Array {
    return this.extraFrameBufferData;
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
    this.drawTextCursor(ctx);
    this.drawMouseCursor(ctx);
  }

  // Used for tests to map colors to the current palette and dump canvas.
  renderVisiblePage(): HTMLCanvasElement {
    const ctx = this.visiblePage.canvas.getContext('2d')!;
    const imageData = this.visiblePage.getImageData(
        this.palette, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.putImageData(imageData, 0, 0);
    return this.visiblePage.canvas;
  }

  private drawTextCursor(ctx: CanvasRenderingContext2D) {
    if (!this.textCursorShown) {
      return;
    }
    const x = (this.getColumn() - 1) * this.cellWidth;
    const y = (this.getRow() - 1) * this.cellHeight;
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

  private drawMouseCursor(ctx: CanvasRenderingContext2D) {
    // This is only called if we are not using the hardware mouse cursor.
    if (!this.mouseCursorShown) {
      return;
    }
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(this.mouseX, this.mouseY);
    ctx.lineTo(this.mouseX + 10, this.mouseY + 10);
    ctx.lineTo(this.mouseX + 6, this.mouseY + 10);
    ctx.lineTo(this.mouseX + 9, this.mouseY + 14);
    ctx.lineTo(this.mouseX + 8, this.mouseY + 16);
    ctx.lineTo(this.mouseX + 4, this.mouseY + 11);
    ctx.lineTo(this.mouseX, this.mouseY + 14);
    ctx.stroke();
    ctx.fill();
  }

  private eraseMouseCursor() {
    if (this.headless) {
      return;
    }
    const ctx = this.canvas.getContext('2d')!;
    const x = this.mouseX;
    const y = this.mouseY;
    const imageData = this.visiblePage.getImageData(this.palette, x - 2, y - 2, 18, 18);
    ctx.putImageData(imageData, x - 2, y - 2);
  }

  private eraseTextCursor() {
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
    if (this.row >= this.scrollEndRow) {
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

  showTextCursor() {
    this.eraseTextCursor();
    this.textCursorShown = true;
  }
  
  hideTextCursor() {
    this.eraseTextCursor();
    this.textCursorShown = false;
  }

  moveTextCursor(dx: number) {
    if (this.activePage !== this.visiblePage) {
      return;
    }
    this.eraseTextCursor();
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

  locateTextCursor(row?: number, column?: number) {
    const [_, rows] = this.geometry.text;
    if (row !== undefined) {
      // LOCATE can jump to the last line on the screen even if it's outside the
      // current view print region.
      if (row !== rows && (row < this.scrollStartRow || row > this.scrollEndRow)) {
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

  configureTextCursor(startScanline: number, endScanline: number, insert?: boolean) {
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
    const [columns, rows] = this.geometry.text;
    if (this.column > columns && this.row < rows) {
      return this.row + 1;
    }
    return this.row;
  }

  override getColumn(): number {
    const [columns, _] = this.geometry.text;
    if (this.column > columns) {
      return 1;
    }
    return this.column;
  }

  getCharAt(row: number, column: number): string {
    this.checkOnScreen(row, column);
    const cell = this.activePage.getCharAt(row, column);
    return cell.char;
  }

  getColorAt(row: number, column: number): number {
    this.checkOnScreen(row, column);
    const cell = this.activePage.getCharAt(row, column);
    return cell.attributes.fgColor;
  }

  getAttributeAt(row: number, column: number): number {
    this.checkOnScreen(row, column);
    const cell = this.activePage.getCharAt(row, column);
    return cell.attributes.fgColor & 15 | (cell.attributes.bgColor << 4) & 0xf0;
  }

  setCharAt(row: number, column: number, char: string) {
    this.checkOnScreen(row, column);
    const cell = this.activePage.getCharAt(row, column);
    cell.char = char;
    this.activePage.putCharAt(row, column, cell);
  }

  setAttributeAt(row: number, column: number, attr: number) {
    this.checkOnScreen(row, column);
    const cell = this.activePage.getCharAt(row, column);
    cell.attributes = {fgColor: attr & 15, bgColor: (attr >> 4) & 15};
    this.activePage.putCharAt(row, column, cell);
  }

  recognizeCharAt(row: number, column: number): string {
    if (this.mode.mode === 0) {
      return this.getCharAt(row, column);
    }
    this.checkOnScreen(row, column);
    return this.visiblePage.recognizeCharAt(row, column, this.fontHash);
  }

  private checkOnScreen(row: number, column: number) {
    const [columns, rows] = this.geometry.text;
    if (row < 1 || column < 1 || row > rows || column > columns) {
      throw new Error("off screen");
    }
  }

  private buildFontHash() {
    const charCanvas = this.canvasProvider.createCanvas(this.cellWidth, this.cellHeight);
    const ctx = charCanvas.getContext('2d', { willReadFrequently: true })!;
    ctx.font = `${this.cellHeight}px '${this.geometry.font}'`;
    ctx.textBaseline = 'top';
    this.fontHash = new Map();
    for (let code = 0; code < 256; code++) {
      const char = asciiToChar.get(code)!;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.cellWidth, this.cellHeight);
      ctx.fillStyle = '#fff';
      ctx.fillText(char, 0, 0);
      const imageData = ctx.getImageData(0, 0, this.cellWidth, this.cellHeight);
      // Character 32 (space) should overwrite 0 (nul).
      this.fontHash.set(hashCharacterCellBitmap(imageData), char);
    }
  }

  setSoftKey(key: number, name: string) {
    this.softKeys.keys[key - 1] = name;
    this.updateSoftKeyLine();
  }

  showSoftKeys() {
    this.softKeys.visible = true;
    this.updateSoftKeyLine();
  }

  hideSoftKeys() {
    if (this.softKeys.visible) {
      const [_, rows] = this.geometry.text;
      this.activePage.clearText(this.color, rows, rows);
    }
    this.softKeys.visible = false;
  }

  private updateSoftKeyLine() {
    if (!this.softKeys.visible) {
      return;
    }
    const [columns, rows] = this.geometry.text;
    const numKeys = columns === 80 ? 10 : 5;
    let template = '';
    for (let i = 0; i < numKeys; i++) {
      template += `${i + 1}`.padEnd(8, ' ');
    }
    for (let i = 1; i <= columns; i++) {
      this.activePage.putCharAt(rows, i, {char: template.charAt(i - 1), attributes: {...this.color}});
    }
    const keyColor = this.mode.mode === 0 && this.color.bgColor === 0 ?
      {fgColor: 0, bgColor: this.mode.defaultFgColor} :
      {fgColor: this.mode.defaultFgColor, bgColor: 0};
    for (let i = 0; i < numKeys; i++) {
      const keyName = this.softKeys.keys[i];
      if (!keyName) {
        continue;
      }
      const startColumn = 8 * i + 2 + (i >= 9 ? 1 : 0);
      const maxLength = i >= 9 ? 5 : 6;
      const formattedName = keyName.slice(0, maxLength).replace(/./g, showControlChar).padEnd(maxLength, ' ');
      for (let j = 0; j < maxLength; j++) {
        this.activePage.putCharAt(rows, startColumn + j, {char: formattedName.charAt(j), attributes: keyColor});
      }
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

  showMouseCursor(x: number, y: number) {
    this.eraseMouseCursor();
    this.mouseCursorShown = true;
    this.mouseX = clamp(x, 0, this.canvas.width);
    this.mouseY = clamp(y, 0, this.canvas.height);
  }

  hideMouseCursor() {
    this.eraseMouseCursor();
  }

  scaleMouseCoordinates(x: number, y: number): {x: number, y: number} {
    // Expect that (x, y) is in canvas content coordinates with (0, 0) at the
    // upper left of the canvas content and (w, h) at the lower right.
    const [width, _] = this.geometry.dots;
    const scaleX = width === 320 ? 2 : 1;
    return {
      x: scaleX * ~~clamp(x, 0, this.canvas.width),
      y: ~~clamp(y, 0, this.canvas.height)
    };
  }
}

function hashCharacterCellBitmap(bitmap: ImageData): string {
  let result = '';
  let index = 0;
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      result += bitmap.data[index] > 0 ? '1' : '0';
      index += 4;
    }
  }
  return result;
}

export class TestScreen implements Screen {
  text: TestPrinter;
  graphics: CanvasScreen;
  hasGraphics: boolean;

  constructor(canvasProvider: CanvasProvider) {
    this.text = new TestPrinter();
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

  configure(modeNumber?: number, colorSwitch?: number, activePage?: number, visiblePage?: number) {
    this.text.print(`[SCREEN ${modeNumber}, ${colorSwitch}, ${activePage}, ${visiblePage}]`, true);
    this.graphics.configure(modeNumber, colorSwitch, activePage, visiblePage);
    this.hasGraphics = true;
  }

  getMode(): ScreenMode {
    return this.graphics.getMode();
  }

  getGeometry(): ScreenGeometry {
    return this.graphics.getGeometry();
  }

  copyPage(sourcePage: number, destPage: number) {
    this.text.print(`[PCOPY ${sourcePage}, ${destPage}]`, true);
    this.graphics.copyPage(sourcePage, destPage);
    this.hasGraphics = true;
  }

  setColor(fgColor?: number, bgColor?: number, borderColor?: number) {
    this.text.print(`[COLOR ${fgColor}, ${bgColor}, ${borderColor}]`, true);
    this.graphics.setColor(fgColor, bgColor, borderColor);
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

  setVgaPaletteIndex(index: number) {
    this.text.print(`[OUT &h3c8, ${index}]`, true);
    this.graphics.setVgaPaletteIndex(index);
    this.hasGraphics = true;
  }

  setVgaPaletteData(data: number) {
    this.text.print(`[OUT &h3c9, ${data}]`, true);
    this.graphics.setVgaPaletteData(data);
    this.hasGraphics = true;
  }

  getVgaPaletteData(): number {
    this.text.print(`[INP &h3c7]`, true);
    this.hasGraphics = true;
    return this.graphics.getVgaPaletteData();
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

  resetViewPrint(fullscreen: boolean) {
    this.text.print(`[VIEW PRINT]`, true);
    this.graphics.resetViewPrint(fullscreen);
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

  clear(options?: number) {
    this.text.print(`[CLS ${options}]`, true);
    this.graphics.clear(options);
  }

  getPixel(x: number, y: number, screen?: boolean): number {
    this.text.print(`[POINT ${x}, ${y}]`, true);
    return this.graphics.getPixel(x, y, screen);
  }

  setPixel(x: number, y: number, color?: number, step?: boolean, screen?: boolean) {
    this.text.print(`[PSET ${x}, ${y}, ${color}, ${step}]`, true);
    this.graphics.setPixel(x, y, color, step, screen);
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

  getBitmap(args: GetBitmapArgs): Uint8Array {
    this.text.print(`[GET ${args.step1}, ${args.x1}, ${args.y1}, ${args.step2}, ${args.x2}, ${args.y2}]`, true);
    return this.graphics.getBitmap(args);
  }

  putBitmap(args: PutBitmapArgs) {
    this.text.print(`[PUT ${args.step}, ${args.x1}, ${args.y1}, ${args.operation}]`, true);
    this.graphics.putBitmap(args);
  }

  setExtraFrameBufferData(data: Uint8Array): void {
    this.text.print(`[setExtraFrameBufferData]`, true);
    this.graphics.setExtraFrameBufferData(data);
  }

  getExtraFrameBufferData(): Uint8Array {
    return this.graphics.getExtraFrameBufferData();
  }

  showTextCursor() {
    this.graphics.showTextCursor();
  }

  hideTextCursor() {
    this.text.print('□', false);
    this.graphics.hideTextCursor();
  }

  moveTextCursor(dx: number) {
    this.text.print((dx < 0 ? '←' : '→').repeat(Math.abs(dx)), false);
    this.graphics.moveTextCursor(dx);
  }

  locateTextCursor(row?: number, column?: number) {
    this.text.print(`[LOCATE ${row}, ${column}]`, true);
    this.graphics.locateTextCursor(row, column);
  }

  configureTextCursor(startScanline: number, endScanline: number, insert?: boolean) {
    if (insert !== undefined) {
      this.text.print(insert ? '■' : '␣', false);
    } else {
      this.text.print(`[LOCATE ,,, ${startScanline}, ${endScanline}]`, true);
    }
    this.graphics.configureTextCursor(startScanline, endScanline);
  }

  getRow(): number {
    return this.graphics.getRow();
  }

  getColumn(): number {
    return this.graphics.getColumn();
  }

  getCharAt(row: number, column: number): string {
    return this.graphics.getCharAt(row, column);
  }

  getColorAt(row: number, column: number): number {
    return this.graphics.getColorAt(row, column);
  }

  getAttributeAt(row: number, column: number): number {
    return this.graphics.getAttributeAt(row, column);
  }

  setCharAt(row: number, column: number, char: string) {
    this.graphics.setCharAt(row, column, char);
  }

  setAttributeAt(row: number, column: number, attr: number) {
    return this.graphics.setAttributeAt(row, column, attr);
  }

  recognizeCharAt(row: number, column: number): string {
    return this.graphics.recognizeCharAt(row, column);
  }

  setSoftKey(key: number, name: string) {
    this.graphics.setSoftKey(key, name);
  }

  showSoftKeys() {
    this.graphics.showSoftKeys();
  }

  hideSoftKeys() {
    this.graphics.hideSoftKeys();
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

  showMouseCursor(x: number, y: number) {
    this.text.print(`[show mouse ${x}, ${y}]`, true);
  }

  hideMouseCursor() {
    this.text.print('[hide mouse]', true);
  }

  scaleMouseCoordinates(x: number, y: number): {x: number, y: number} {
    return {x, y};
  }
}

function findTextGeometry(mode: ScreenMode, width: number, height: number): ScreenGeometry | undefined {
  return mode.geometry.find((entry) => (
    entry.text[0] === width && entry.text[1] === height
  ));
}