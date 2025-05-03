import { cssForColorIndex } from "./Colors.ts";

export interface Point {
  x: number;
  y: number;
}

export interface LineArgs {
  x1?: number;
  y1?: number;
  step1: boolean;
  x2: number;
  y2: number;
  step2: boolean;
  outline: boolean;
  fill: boolean; 
  dash?: number;
}

export interface CircleArgs {
  step: boolean;
  x: number;
  y: number;
  radius: number;
  start?: number;
  end?: number;
  aspect?: number;
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
  pattern: number;

  constructor(width: number, height: number) {
    this.cursor = {x: Math.floor(width / 2), y: Math.floor(height / 2)};
    this.clip = Region.fromSize(width, height);
    this.windowToView = new WindowToViewTransform(width, height);
    this.pattern = 0xffff;
  }

  setPixel(ctx: CanvasRenderingContext2D, x: number, y: number, color: number, step?: boolean) {
    const pw = step ? {x: x + this.cursor.x, y: y + this.cursor.y} : {x, y};
    const pv = this.windowToView.transform(pw);
    this.fillPixel(ctx, pv, color);
    this.cursor = {...pw};
  }

  line(ctx: CanvasRenderingContext2D, args: LineArgs, color: number) {
    const [x1, y1] = [args.x1 ?? this.cursor.x, args.y1 ?? this.cursor.y];
    const p1 = args.step1 ?
      {x: x1 + this.cursor.x, y: y1 + this.cursor.y} :
      {x: x1, y: y1};
    this.cursor = {...p1};
    const p2 = args.step2 ?
      {x: args.x2 + this.cursor.x, y: args.y2 + this.cursor.y} :
      {x: args.x2, y: args.y2};
    this.cursor = {...p2};
    const p1v = this.windowToView.transform(p1);
    const p2v = this.windowToView.transform(p2);
    this.pattern = args.dash !== undefined ? args.dash & 0xffff : 0xffff;
    if (args.outline) {
      if (args.dash === undefined) {
        this.strokeRectangle(ctx, p1v, p2v, color);
      } else {
        this.dashRectangle(ctx, p1v, p2v, color);
      }
    } else if (args.fill) {
      this.fillRectangle(ctx, p1v, p2v, color);
    } else {
      this.drawLine(ctx, p1v, p2v, color);
    }
  }

  circle(ctx: CanvasRenderingContext2D, args: CircleArgs, color: number, aspect: number) {
    const center = args.step ?
      {x: args.x + this.cursor.x, y: args.y + this.cursor.y} :
      {x: args.x, y: args.y};
    this.cursor = {...center};
    this.drawCircle(ctx, center, args.radius, color, aspect, args.start, args.end);
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

  private dashPlot(ctx: CanvasRenderingContext2D, x: number, y: number, color: number) {
    if (this.pattern & 0x8000) {
      this.fillPixel(ctx, { x, y }, color);
    }
    this.pattern = (this.pattern << 1) | ((this.pattern >> 15) & 1);
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

  private dashRectangle(ctx: CanvasRenderingContext2D, p1: Point, p2: Point, color: number) {
    const r = Region.fromPoints(p1, p2).intersect(this.clip);
    for (let x = r.x.start; x <= r.x.end; x++) {
      this.dashPlot(ctx, x, r.y.end, color);
    }
    for (let x = r.x.start; x <= r.x.end; x++) {
      this.dashPlot(ctx, x, r.y.start, color);
    }
    for (let y = r.y.start; y <= r.y.end; y++) {
      this.dashPlot(ctx, r.x.end, y, color);
    }
    for (let y = r.y.start; y <= r.y.end; y++) {
      this.dashPlot(ctx, r.x.start, y, color);
    }
  }

  private drawLine(ctx: CanvasRenderingContext2D, p1: Point, p2: Point, color: number) {
    // QBasic seems to use a subtly broken Bresenham-style line rasterizer that
    // makes extreme slopes rasterize unevenly.  For example, you'd expect a line
    // from (0, 0)-(100, 1) to jog down by 1px in y after 50px in x, but actually
    // it jogs down after 25px in x.  This behavior is consistent with doubled
    // Bresenham error terms (the factor BUG here).  Using dash style, it's also
    // possible to verify its loop always steps x from left to right.
    const BUG = 2;
    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);
    if (dx > dy) {
      if (p1.x > p2.x) {
        [p1, p2] = [p2, p1];
      }
      if (p2.y > p1.y) {
        let error = BUG * 2 * dy - dx;
        for (let x = p1.x, y = p1.y; x <= p2.x; x++) {
          this.dashPlot(ctx, x, y, color);
          if (error > 0) {
            y++;
            error -= BUG * (2 * dx);
          }
          error += BUG * (2 * dy);
        }
      } else {
        let error = BUG * 2 * dy - dx;
        for (let x = p1.x, y = p1.y; x <= p2.x; x++) {
          this.dashPlot(ctx, x, y, color);
          if (error > 0) {
            y--;
            error -= BUG * (2 * dx);
          }
          error += BUG * (2 * dy);
        }
      }
    } else {
      if (p1.x > p2.x) {
        [p1, p2] = [p2, p1];
      }
      if (p2.y > p1.y) {
        let error = BUG * 2 * dx - dy;
        for (let y = p1.y, x = p1.x; y <= p2.y; y++) {
          this.dashPlot(ctx, x, y, color);
          if (error > 0) {
            x++;
            error -= BUG * (2 * dy);
          }
          error += BUG * (2 * dx);
        }
      } else {
        let error = BUG * 2 * dx - dy;
        for (let y = p1.y, x = p1.x; y >= p2.y; y--) {
          this.dashPlot(ctx, x, y, color);
          if (error > 0) {
            x++;
            error -= BUG * (2 * dy);
          }
          error += BUG * (2 * dx);
        }
      }
    }
  }

  // TODO: Figure out how to make this pixel accurate.
  private drawCircle(
    ctx: CanvasRenderingContext2D,
    center: Point,
    radius: number,
    color: number,
    aspect: number,
    start?: number,
    end?: number,
  ) {
    const [rx, ry] = [radius, radius * aspect];
    start = start ?? 0;
    end = end ?? 2 * Math.PI;
    const drawLineToStart = start !== undefined && start < 0;
    const drawLineToEnd = end !== undefined && end < 0;
    let minToStart = 10;
    let minToEnd = 10;
    let startPoint: Point | undefined;
    let endPoint: Point | undefined;
    start = Math.abs(start);
    end = Math.abs(end);

    const pointToAngle = (x: number, y: number) => {
      const [cx, cy] = [x - center.x, center.y - y];
      const angle = Math.atan2(cy, cx);
      return angle >= 0 ? angle : 2 * Math.PI + angle;
    };
    const isPointOnArc = (angle: number): boolean => {
      if (start <= end) {
        return angle >= start && angle <= end;
      }
      return !(angle >= end && angle <= start);
    };
    const angleDifference = (a: number, b: number) => (
      Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)))
    );
    const plot = (x: number, y: number) => {
      x = Math.floor(x);
      y = Math.floor(y);
      const angle = pointToAngle(x, y);
      if (isPointOnArc(angle)) {
        this.fillPixel(ctx, {x, y}, color);
      }
      if (drawLineToStart) {
        const toStart = angleDifference(angle, start);
        if (toStart < minToStart) {
          startPoint = {x, y};
          minToStart = toStart;
        }
      }
      if (drawLineToEnd) {
        const toEnd = angleDifference(angle, end);
        if (toEnd < minToEnd) {
          endPoint = {x, y};
          minToEnd = toEnd;
        }
      }
    };

    // https://zingl.github.io/bresenham.html
    let [x0, y0, x1, y1] = [center.x - rx, center.y - ry, center.x + rx, center.y + ry];
    let a = Math.abs(x1 - x0);
    let b = Math.abs(y1 - y0);
    let b1 = b % 2;
    let dx = 4 * (1 - a) * b * b;
    let dy = 4 * (b1 + 1) * a * a;
    let err = dx + dy + b1 * a * a;

    if (x0 > x1) { x0 = x1; x1 += a; } // if called with swapped points
    if (y0 > y1) y0 = y1;              // .. exchange them
    y0 += (b + 1) / 2; y1 = y0 - b1;   // starting pixel
    a *= 8 * a; b1 = 8 * b *b;

    do {
      plot(x1, y0);
      plot(x0, y0);
      plot(x0, y1);
      plot(x1, y1);
      const e2 = 2 * err;
      if (e2 <= dy) { y0++; y1--; err += dy += a; }  // y step
      if (e2 >= dx || 2 * err > dy) { x0++; x1--; err += dx += b1; } // x step
    } while (x0 <= x1);

    while (y0 - y1 < b) {  // too early stop of flat ellipses a=1
      plot(x0 - 1, y0);    // -> finish tip of ellipse
      plot(x1 + 1, y0++);
      plot(x0 - 1, y1);
      plot(x1 + 1, y1--);
    }

    if (startPoint) {
      this.drawLine(ctx, center, startPoint, color);
    }
    if (endPoint) {
      this.drawLine(ctx, center, endPoint, color);
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

  constructor(width: number, height: number) {
    this.view = Region.fromSize(width, height);
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