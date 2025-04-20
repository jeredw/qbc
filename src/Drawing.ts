import { cssForColorIndex } from "./Colors.ts";

export interface Point {
  x: number;
  y: number;
}

class Range {
  constructor(public start: number, public end: number) {
  }

  isEmpty() {
    return this.end < this.start;
  }

  contains(p: number): boolean {
    return p >= this.start && p <= this.end;
  }

  length(): number {
    return 1 + this.end - this.start;
  }

  intersect(r: Range) {
    return new Range(Math.max(this.start, r.start), Math.min(this.end, r.end));
  }
}

class Region {
  constructor(public x: Range, public y: Range) {
  }

  static fromPoints(p1: Point, p2: Point, invertY?: boolean): Region {
    return new Region(
      new Range(Math.min(p1.x, p2.x), Math.max(p1.x, p2.x)),
      invertY ?
        new Range(Math.max(p1.y, p2.y), Math.min(p1.y, p2.y)) :
        new Range(Math.min(p1.y, p2.y), Math.max(p1.y, p2.y))
    );
  }

  static fromSize(width: number, height: number): Region {
    return new Region(new Range(0, width - 1), new Range(0, height - 1));
  }

  isEmpty() {
    return this.x.isEmpty() || this.y.isEmpty();
  }

  contains(p: Point): boolean {
    return this.x.contains(p.x) && this.y.contains(p.y);
  }

  intersect(r: Region): Region {
    return new Region(this.x.intersect(r.x), this.y.intersect(r.y));
  }
}

export class Plotter {
  cursor: Point;
  windowToView: WindowToViewTransform;
  clip: Region;

  constructor(screenWidth: number, screenHeight: number) {
    this.cursor = {x: Math.floor(screenWidth / 2), y: Math.floor(screenHeight / 2)};
    this.clip = Region.fromSize(screenWidth, screenHeight);
    this.windowToView = new WindowToViewTransform(screenWidth, screenHeight);
  }

  setPixel(ctx: CanvasRenderingContext2D, x: number, y: number, color: number, step?: boolean) {
    const pw = step ? {x: x + this.cursor.x, y: y + this.cursor.y} : {x, y};
    const pv = this.windowToView.transform(pw);
    this.fillPixel(ctx, pv, color);
    this.cursor = pw;
  }

  setWindow(p1: Point, p2: Point, screen: boolean) {
    this.windowToView.setWindow(p1, p2, screen);
  }

  resetWindow() {
    this.windowToView.resetWindow();
  }

  setClip(p1: Point, p2: Point) {
    this.clip = Region.fromPoints(p1, p2);
  }

  setView(p1: Point, p2: Point) {
    this.windowToView.setView(p1, p2);
  }

  drawViewBox(ctx: CanvasRenderingContext2D, p1: Point, p2: Point, color?: number, border?: number) {
    if (color !== undefined) {
      const r = Region.fromPoints(p1, p2);
      ctx.fillStyle = cssForColorIndex(color);
      ctx.fillRect(r.x.start, r.y.start, r.x.length(), r.y.length());
    }
    if (border !== undefined) {
      const r = Region.fromPoints({x: p1.x - 1, y: p1.y - 1}, {x: p2.x + 1, y: p2.y + 1});
      ctx.fillStyle = cssForColorIndex(border);
      ctx.fillRect(r.x.start, r.y.start, r.x.length(), 1);
      ctx.fillRect(r.x.start, r.y.end, r.x.length(), 1);
      ctx.fillRect(r.x.start, r.y.start, 1, r.y.length());
      ctx.fillRect(r.x.end, r.y.start, 1, r.y.length());
    }
  }

  private fillPixel(ctx: CanvasRenderingContext2D, p: Point, color: number) {
    if (this.clip.contains(p)) {
      ctx.fillStyle = cssForColorIndex(color);
      ctx.fillRect(p.x, p.y, 1, 1);
    }
  }

  private strokeRectangle(ctx: CanvasRenderingContext2D, p1: Point, p2: Point, color: number) {
    const rUnclipped = Region.fromPoints(p1, p2);
    const r = rUnclipped.intersect(this.clip);
    if (r.isEmpty()) {
      return;
    }
    ctx.fillStyle = cssForColorIndex(color);
    if (this.clip.y.contains(rUnclipped.y.start)) {
      ctx.fillRect(r.x.start, r.y.start, r.x.length(), 1);
    }
    if (this.clip.y.contains(rUnclipped.y.end)) {
      ctx.fillRect(r.x.start, r.y.end, r.x.length(), 1);
    }
    if (this.clip.x.contains(rUnclipped.x.start)) {
      ctx.fillRect(r.x.start, r.y.start, 1, r.y.length());
    }
    if (this.clip.x.contains(rUnclipped.x.end)) {
      ctx.fillRect(r.x.end, r.y.start, 1, r.y.length());
    }
  }

  private fillRectangle(ctx: CanvasRenderingContext2D, p1: Point, p2: Point, color: number) {
    const r = Region.fromPoints(p1, p2).intersect(this.clip);
    if (r.isEmpty()) {
      return;
    }
    ctx.fillStyle = cssForColorIndex(color);
    ctx.fillRect(r.x.start, r.y.start, r.x.length(), r.y.length());
  }

  private dashRectangle(ctx: CanvasRenderingContext2D, p1: Point, p2: Point, color: number, pattern: number) {
    const r = Region.fromPoints(p1, p2).intersect(this.clip);
    for (let x = r.x.start; x <= r.x.end; x++) {
      if (pattern & 1) {
        this.fillPixel(ctx, {x, y: r.y.end}, color);
      }
      pattern = ((pattern << 15) & 0x8000) | (pattern >> 1);
    }
    for (let x = r.x.start; x <= r.x.end; x++) {
      if (pattern & 1) {
        this.fillPixel(ctx, {x, y: r.y.start}, color);
      }
      pattern = ((pattern << 15) & 0x8000) | (pattern >> 1);
    }
    for (let y = r.y.start; y <= r.y.end; y++) {
      if (pattern & 1) {
        this.fillPixel(ctx, {x: r.x.end, y}, color);
      }
      pattern = ((pattern << 15) & 0x8000) | (pattern >> 1);
    }
    for (let y = r.y.start; y <= r.y.end; y++) {
      if (pattern & 1) {
        this.fillPixel(ctx, {x: r.x.start, y}, color);
      }
      pattern = ((pattern << 15) & 0x8000) | (pattern >> 1);
    }
  }
}

class WindowToViewTransform {
  window?: Region;
  view: Region;
  x0: number;
  y0: number;
  dx: number;
  dy: number;

  constructor(screenWidth: number, screenHeight: number) {
    this.view = Region.fromSize(screenWidth, screenHeight);
    this.update();
  }

  private update() {
    if (this.window) {
      [this.x0, this.dx] = remapRange(this.window.x, this.view.x);
      [this.y0, this.dy] = remapRange(this.window.y, this.view.y);
    } else {
      [this.x0, this.dx] = [this.view.x.start, 1];
      [this.y0, this.dy] = [this.view.y.start, 1];
    }
  }

  resetWindow() {
    this.window = undefined;
    this.update();
  }

  setWindow(p1: Point, p2: Point, screen: boolean) {
    this.window = Region.fromPoints(p1, p2, !screen);
    this.update();
  }

  setView(p1: Point, p2: Point) {
    this.view = Region.fromPoints(p1, p2);
    this.update();
  }

  transform(p: Point): Point {
    return {
      x: Math.floor(this.x0 + p.x * this.dx),
      y: Math.floor(this.y0 + p.y * this.dy),
    };
  }
}

function remapRange(from: Range, to: Range): [number, number] {
  const dx = (to.end - to.start) / (from.end - from.start);
  const x0 = (from.end * to.start - from.start * to.end) / (from.end - from.start);
  return [x0, dx];
}