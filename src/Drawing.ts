import { cssForColorIndex } from "./Colors.ts";
import { roundToNearestEven } from "./Math.ts";

export interface Point {
  x: number;
  y: number;
}

export interface LineArgs {
  step1: boolean;
  x1?: number;
  y1?: number;
  step2: boolean;
  x2: number;
  y2: number;
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

export interface PaintArgs {
  step: boolean;
  x: number;
  y: number;
  tile?: number[];
  borderColor?: number;
  background?: number[];
}

export interface GetBitmapArgs {
  step1: boolean;
  x1: number;
  y1: number;
  step2: boolean;
  x2: number;
  y2: number;
}

export interface PutBitmapArgs {
  step: boolean;
  x1: number;
  y1: number;
  operation: BlitOperation;
  data: Uint8Array;
}

export enum BlitOperation {
  PSET,
  PRESET,
  AND,
  OR,
  XOR
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

  get left() {
    return this.x.start;
  }

  get right() {
    return this.x.end;
  }

  get top() {
    return this.y.start;
  }

  get bottom() {
    return this.y.end;
  }

  get width() {
    return this.x.length();
  }

  get height() {
    return this.y.length();
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

class BitStream {
  private bitOffset: number = 7;

  constructor(private data: DataView, private byteOffset: number = 0) {
  }

  read(): boolean {
    if (this.byteOffset >= this.data.byteLength) {
      return false;
    }
    const result = !!(this.data.getUint8(this.byteOffset) & (1 << this.bitOffset));
    this.nextBit();
    return result;
  }

  write(bit: boolean) {
    if (bit) {
      const current = this.data.getUint8(this.byteOffset);
      this.data.setUint8(this.byteOffset, current | (1 << this.bitOffset));
    }
    this.nextBit();
  }

  finishByte() {
    if (this.bitOffset != 7) {
      this.byteOffset++;
      this.bitOffset = 7;
    }
  }

  private nextBit() {
    if (this.bitOffset === 0) {
      this.byteOffset++;
      this.bitOffset = 8;
    }
    this.bitOffset--;
  }
}

export class Plotter {
  cursor: Point;
  coordinates: ViewTransform;
  clip: Region;
  pattern: number;

  constructor(width: number, height: number) {
    this.reset(width, height);
  }

  reset(width: number, height: number) {
    this.cursor = {x: Math.floor(width / 2), y: Math.floor(height / 2)};
    this.clip = Region.fromSize(width, height);
    this.coordinates = new ViewTransform(width, height);
    this.pattern = 0xffff;
  }

  screenToWindow(p: Point): Point {
    return this.coordinates.screenToWindow(p);
  }

  viewToWindow(p: Point): Point {
    return this.coordinates.viewToWindow(p);
  }

  windowToScreen(p: Point): Point {
    return this.coordinates.windowToScreen(p);
  }

  windowToView(p: Point): Point {
    return this.coordinates.windowToView(p);
  }

  private snap(p: Point): Point {
    return {x: roundToNearestEven(p.x), y: roundToNearestEven(p.y)};
  }

  getPixel(ctx: CanvasRenderingContext2D, x: number, y: number, screen?: boolean): number {
    const pv = screen ? this.snap({x, y}) : this.windowToScreen({x, y});
    if (this.clip.contains(pv)) {
      const imageData = ctx.getImageData(pv.x, pv.y, 1, 1);
      return imageData.data[0];
    }
    return -1;
  }

  setPixel(ctx: CanvasRenderingContext2D, x: number, y: number, color: number, step?: boolean, screen?: boolean) {
    const pw = step ? {x: x + this.cursor.x, y: y + this.cursor.y} : {x, y};
    const pv = screen ? this.snap({x, y}): this.windowToScreen(pw);
    this.fillPixel(ctx, pv, color);
    this.cursor = {...pw};
  }

  getBitmap(ctx: CanvasRenderingContext2D, args: GetBitmapArgs, bppPerPlane: number, planes: number): Uint8Array {
    const [x1, y1] = [args.x1 ?? this.cursor.x, args.y1 ?? this.cursor.y];
    const p1 = args.step1 ?
      {x: x1 + this.cursor.x, y: y1 + this.cursor.y} :
      {x: x1, y: y1};
    this.cursor = {...p1};
    const p2 = args.step2 ?
      {x: args.x2 + this.cursor.x, y: args.y2 + this.cursor.y} :
      {x: args.x2, y: args.y2};
    this.cursor = {...p2};
    const p1v = this.windowToScreen(p1);
    const p2v = this.windowToScreen(p2);
    const r = Region.fromPoints(p1v, p2v);
    const attributes = ctx.getImageData(r.left, r.top, r.width, r.height);
    const sizeInBytes = 4 + Math.ceil(r.width * bppPerPlane / 8) * planes * r.height;
    const buffer = new ArrayBuffer(sizeInBytes);
    const data = new DataView(buffer);
    const littleEndian = true;
    data.setInt16(0, r.width * bppPerPlane, littleEndian);
    data.setInt16(2, r.height, littleEndian);
    const bitStream = new BitStream(data, 4);
    let offset = 0;
    for (let y = r.top; y <= r.bottom; y++) {
      const rowStart = offset;
      for (let plane = 0; plane < planes; plane++) {
        offset = rowStart;
        for (let x = r.left; x <= r.right; x++) {
          const color = attributes.data[offset] >> plane;
          offset += 4;
          for (let bit = bppPerPlane - 1; bit >= 0; bit--) {
            bitStream.write(!!(color & (1 << bit)));
          }
        }
        bitStream.finishByte();
      }
    }
    return new Uint8Array(buffer);
  }

  putBitmap(ctx: CanvasRenderingContext2D, args: PutBitmapArgs, bppPerPlane: number, planes: number) {
    const [x1, y1] = [args.x1 ?? this.cursor.x, args.y1 ?? this.cursor.y];
    const p1 = args.step ?
      {x: x1 + this.cursor.x, y: y1 + this.cursor.y} :
      {x: x1, y: y1};
    this.cursor = {...p1};
    const p1v = this.windowToScreen(p1);
    if (args.data.byteLength < 4) {
      return;
    }
    let view = new DataView(args.data.buffer, args.data.byteOffset, args.data.byteLength);
    const littleEndian = true;
    const width = view.getInt16(0, littleEndian) / bppPerPlane;
    const height = view.getInt16(2, littleEndian);
    const sizeInBytes = 4 + Math.ceil((width * bppPerPlane) / 8) * planes * height;
    if (view.byteLength < sizeInBytes) {
      // QBasic tolerates reading bitmap data out of bounds.
      const padded = new Uint8Array(sizeInBytes);
      padded.set(new Uint8Array(args.data), 0);
      view = new DataView(padded.buffer);
    }
    const overwrite = (
      args.operation === BlitOperation.PSET ||
      args.operation === BlitOperation.PRESET
    );
    const attributes = overwrite ?
      ctx.createImageData(width, height) :
      ctx.getImageData(p1v.x, p1v.y, width, height);
    const bitStream = new BitStream(view, 4);
    let offset = 0;
    for (let y = 0; y < height; y++) {
      const rowStart = offset;
      for (let plane = 0; plane < planes; plane++) {
        offset = rowStart;
        for (let x = 0; x < width; x++) {
          let channel = 0;
          for (let b = bppPerPlane - 1; b >= 0; b--) {
            channel = (channel << 1) | (bitStream.read() ? 1 : 0);
          }
          const mask = ((1 << bppPerPlane) - 1) << plane;
          switch (args.operation) {
            case BlitOperation.PSET:
              attributes.data[offset] |= channel << plane;
              break;
            case BlitOperation.PRESET:
              attributes.data[offset] |= ((~channel) << plane) & mask;
              break;
            case BlitOperation.AND:
              attributes.data[offset] &= 0xff ^ (mask & ~(channel << plane));
              break;
            case BlitOperation.OR:
              attributes.data[offset] |= channel << plane;
              break;
            case BlitOperation.XOR:
              attributes.data[offset] ^= channel << plane;
              break;
          }
          attributes.data[offset + 1] = 0;
          attributes.data[offset + 2] = 0;
          attributes.data[offset + 3] = 255;
          offset += 4;
        }
        bitStream.finishByte();
      }
    }
    ctx.putImageData(attributes, p1v.x, p1v.y);
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
    const p1v = this.windowToScreen(p1);
    const p2v = this.windowToScreen(p2);
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
    const centerScreen = this.windowToScreen(center);
    const right = {x: center.x + args.radius, y: center.y};
    const radiusScreen = Math.abs(this.windowToScreen(right).x - centerScreen.x);
    this.drawCircle(ctx, centerScreen, radiusScreen, color, aspect, args.start, args.end);
  }

  paint(ctx: CanvasRenderingContext2D, args: PaintArgs, color: number, bppPerPlane: number, planes: number) {
    const pw = args.step ?
      {x: args.x + this.cursor.x, y: args.y + this.cursor.y} :
      {x: args.x, y: args.y};
    this.cursor = {...pw};
    const pv = this.windowToScreen(pw);
    if (args.tile) {
      const width = 8 / bppPerPlane;
      const height = Math.ceil(args.tile.length / planes);
      const attributes = ctx.createImageData(width, height);
      const buffer = new Uint8Array(args.tile).buffer;
      const bitStream = new BitStream(new DataView(buffer), 0);
      let offset = 0;
      for (let y = 0; y < height; y++) {
        const rowStart = offset;
        for (let plane = 0; plane < planes; plane++) {
          offset = rowStart;
          for (let x = 0; x < width; x++) {
            let channel = 0;
            for (let b = bppPerPlane - 1; b >= 0; b--) {
              channel = (channel << 1) | (bitStream.read() ? 1 : 0);
            }
            const mask = ((1 << bppPerPlane) - 1) << plane;
            attributes.data[offset] |= channel << plane;
            attributes.data[offset + 1] = 0;
            attributes.data[offset + 2] = 0;
            attributes.data[offset + 3] = 255;
            offset += 4;
          }
          bitStream.finishByte();
        }
      }
      const lookup = (p: Point): number => {
        const x = Math.floor(p.x) % width;
        const y = Math.floor(p.y) % height;
        const offset = 4 * (y * width + x);
        return attributes.data[offset] ?? 0;
      };
      this.floodFill(ctx, pv, lookup, args.borderColor ?? color);
    } else {
      // Color fill does not enqueue neighboring pixels if they are already the
      // paint color.  This prevents paint escaping an area partially bordered
      // by borderColor and the paint color.
      this.floodFill(ctx, pv, () => color, args.borderColor ?? color, /*skipAlreadyPainted=*/ true);
    }
  }

  setWindow(p1: Point, p2: Point, screen: boolean) {
    const oldCursor = this.windowToScreen(this.cursor);
    this.coordinates.setWindow(p1, p2, screen);
    this.cursor = this.screenToWindow(oldCursor);
  }

  resetWindow() {
    const oldCursor = this.windowToScreen(this.cursor);
    this.coordinates.resetWindow();
    this.cursor = this.screenToWindow(oldCursor);
  }

  setClip(p1: Point, p2: Point) {
    this.clip = Region.fromPoints(p1, p2);
  }

  setView(p1: Point, p2: Point) {
    this.coordinates.setView(p1, p2);
    this.cursor = this.viewToWindow(this.coordinates.getViewCenter());
  }

  clearView(ctx: CanvasRenderingContext2D, color: number) {
    const r = this.coordinates.view;
    ctx.fillStyle = cssForColorIndex(color);
    ctx.fillRect(r.x.start, r.y.start, r.x.length(), r.y.length());
    this.resetCursor();
  }

  resetCursor() {
    this.cursor = this.viewToWindow(this.coordinates.getViewCenter());
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

  private drawCircle(
    ctx: CanvasRenderingContext2D,
    center: Point,
    radius: number,
    color: number,
    aspect: number,
    start = 0,
    end = 2 * Math.PI,
  ) {
    const drawLineToStart = start < 0;
    const drawLineToEnd = end < 0;
    const MAX_ANGLE = 6.283185720443725;
    start = Math.abs(start);
    end = Math.abs(end);
    if (start > MAX_ANGLE) {
      throw new Error('Start angle out of bounds');
    }
    start = Math.min(start, 2 * Math.PI);
    if (end > MAX_ANGLE) {
      throw new Error('End angle out of bounds');
    }
    end = Math.min(end, 2 * Math.PI);
    let startPoint: Point | undefined;
    let endPoint: Point | undefined;

    if (aspect < 0) {
      // Passing e.g. aspect=-100.1 has the same effect as .9
      aspect = 1 + (aspect % 1);
    }
    const [rx, ry] = aspect > 1 ?
      [roundToNearestEven(radius / aspect), radius] :
      [radius, roundToNearestEven(radius * aspect)];
    if (rx === 0) {
      // For extreme ellipses when aspect is large, draw a vertical line.
      this.drawLine(ctx, {x: center.x, y: center.y - ry}, {x: center.x, y: center.y + ry}, color);
      return;
    }

    // QBasic uses the x-step during scan conversion and the current octant to
    // determine if a point is on an arc.  It assumes there are Q = R cos(45)
    // x-steps per octant, numbered counter-clockwise from 0 degrees.  Note that
    // the step direction during rasterization (indicated by arrows on the
    // diagram below) is sometimes clockwise and sometimes counter-clockwise.
    //
    //   octant | theta | step#                π/2
    //  --------+-------+------          \← ← ← | → → →/
    //        0 |     0 |  0             ↑  \ 2 | 1 /  ↑
    //        1 |   π/4 |  Q             ↑  3  \|/  0  ↑
    //        2 |   π/2 | 2Q          π  -------*-------   0
    //        3 |  3π/4 | 3Q             ↓  4  /|\  7  ↓
    //        4 |     π | 4Q             ↓  / 5 | 6 \  ↓
    //        5 |  5π/4 | 5Q             /← ← ← | → → →\
    //        6 |  3π/2 | 6Q                  3π/2
    //        7 |  7π/4 | 7Q
    //
    // To convert from an angle to an x-step number in an octant, we project
    // onto the x-axis.
    const stepsPerOctant = roundToNearestEven(radius * Math.sqrt(2) / 2);
    const angleToStep = (angle: number) => {
      if (angle === 2 * Math.PI) {
        return 0xffff;
      }
      const octant = Math.floor(4 / Math.PI * angle);
      switch (octant & 7) {
        case 0:
          return roundToNearestEven(radius * Math.abs(Math.sin(angle)));
        case 1:
          return 2 * stepsPerOctant - roundToNearestEven(radius * Math.abs(Math.cos(angle)));
        case 2:
          return 2 * stepsPerOctant + roundToNearestEven(radius * Math.abs(Math.cos(angle)));
        case 3:
          return 4 * stepsPerOctant - roundToNearestEven(radius * Math.abs(Math.sin(angle)));
        case 4:
          return 4 * stepsPerOctant + roundToNearestEven(radius * Math.abs(Math.sin(angle)));
        case 5:
          return 6 * stepsPerOctant - roundToNearestEven(radius * Math.abs(Math.cos(angle)));
        case 6:
          return 6 * stepsPerOctant + roundToNearestEven(radius * Math.abs(Math.cos(angle)));
        case 7:
          return 8 * stepsPerOctant - roundToNearestEven(radius * Math.abs(Math.sin(angle)));
      }
      throw new Error("invalid octant");
    };
    const startStep = angleToStep(start);
    const endStep = angleToStep(end);
    const isStepOnArc = (step: number): boolean => {
      if (startStep <= endStep) {
        return step >= startStep && step <= endStep;
      }
      return !(step > endStep && step < startStep);
    };
    const plot = (x: number, y: number, step: number) => {
      x = Math.floor(x);
      y = Math.floor(y);
      if (isStepOnArc(step)) {
        this.fillPixel(ctx, {x, y}, color);
      }
      if (drawLineToStart && step === startStep) {
        startPoint = {x, y};
      }
      if (drawLineToEnd && step === endStep) {
        endPoint = {x, y};
      }
    };

    // QBasic scan converts ellipses as circles and scales points to plot in
    // each octant.  This results in stair stepping along either the left and
    // right or top and bottom, and is actually probably slower than just using
    // a more precise midpoint ellipse algorithm.
    const [cx, cy] = [roundToNearestEven(center.x), roundToNearestEven(center.y)];
    // Points are scaled using fixed point integer arithmetic with 8 bits
    // of fraction.
    const f = aspect < 1 ? Math.trunc(aspect * 256) : Math.trunc(256 / aspect);
    const scale = (u: number) => Math.trunc((u * f + 128) / 256);
    const plotOctants = (x: number, y: number) => {
      const [sx, sy] = [scale(x), scale(y)];
      if (aspect < 1) {
        plot(cx + y, cy - sx, x);
        plot(cx + x, cy - sy, 2 * stepsPerOctant - x);
        plot(cx - x, cy - sy, 2 * stepsPerOctant + x);
        plot(cx - y, cy - sx, 4 * stepsPerOctant - x);
        plot(cx - y, cy + sx, 4 * stepsPerOctant + x);
        plot(cx - x, cy + sy, 6 * stepsPerOctant - x);
        plot(cx + x, cy + sy, 6 * stepsPerOctant + x);
        plot(cx + y, cy + sx, 8 * stepsPerOctant - x);
      } else {
        plot(cx + sy, cy - x, x);
        plot(cx + sx, cy - y, 2 * stepsPerOctant - x);
        plot(cx - sx, cy - y, 2 * stepsPerOctant + x);
        plot(cx - sy, cy - x, 4 * stepsPerOctant - x);
        plot(cx - sy, cy + x, 4 * stepsPerOctant + x);
        plot(cx - sx, cy + y, 6 * stepsPerOctant - x);
        plot(cx + sx, cy + y, 6 * stepsPerOctant + x);
        plot(cx + sy, cy + x, 8 * stepsPerOctant - x);
      }
    };

    let [x, y] = [0, radius];
    let error = 1 - radius;
    while (x < y) {
      plotOctants(x, y);
      if (error >= 0) {
        error += -2 * y + 2;
        y--;
      }
      error += 2 * x + 3;
      x++;
    }
    plotOctants(x, y);

    if (startPoint) {
      this.drawLine(ctx, center, startPoint, color);
    }
    if (endPoint) {
      this.drawLine(ctx, center, endPoint, color);
    }
  }

  private floodFill(ctx: CanvasRenderingContext2D, start: Point, color: (p: Point) => number, border: number, skipAlreadyPainted=false) {
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const queue: Point[] = [start];
    const hash = (p: Point) => `${p.x},${p.y}`;
    const queued: Set<String> = new Set([hash(start)]);
    const enqueue = (p: Point) => {
      if (skipAlreadyPainted) {
        const offset = 4 * (imageData.width * p.y + p.x);
        if (imageData.data[offset] === color(p)) {
          return;
        }
      }
      if (!queued.has(hash(p))) {
        queued.add(hash(p));
        queue.push(p);
      }
    };
    while (true) {
      const p = queue.shift();
      if (p === undefined) {
        break;
      }
      if (this.clip.contains(p)) {
        const offset = 4 * (imageData.width * p.y + p.x);
        if (imageData.data[offset] !== border) {
          imageData.data[offset] = color(p);
          enqueue({x: p.x - 1, y: p.y});
          enqueue({x: p.x + 1, y: p.y});
          enqueue({x: p.x, y: p.y - 1});
          enqueue({x: p.x, y: p.y + 1});
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }
}

class ViewTransform {
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

  getViewCenter(): Point {
    // Note: round up so that cursor starts at the correct place.
    return {
      x: Math.round((this.view.x.end - this.view.x.start) / 2),
      y: Math.round((this.view.y.end - this.view.y.start) / 2)
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

  windowToScreen(p: Point): Point {
    return {
      x: roundToNearestEven(this.x0 + p.x * this.dx),
      y: roundToNearestEven(this.y0 + p.y * this.dy)
    };
  }

  windowToView(p: Point): Point {
    return {
      x: roundToNearestEven(this.x0 + p.x * this.dx) - this.view.x.start,
      y: roundToNearestEven(this.y0 + p.y * this.dy) - this.view.y.start
    };
  }

  screenToWindow(p: Point): Point {
    return {
      x: roundToNearestEven((p.x - this.x0) / this.dx),
      y: roundToNearestEven((p.y - this.y0) / this.dy)
    }
  }

  viewToWindow(p: Point): Point {
    return {
      x: ((p.x + this.view.x.start) - this.x0) / this.dx,
      y: ((p.y + this.view.y.start) - this.y0) / this.dy
    }
  }
}

function remapRange(from: Range, to: Range): [number, number] {
  const dx = (to.end - to.start) / (from.end - from.start);
  const x0 = (from.end * to.start - from.start * to.end) / (from.end - from.start);
  return [x0, dx];
}