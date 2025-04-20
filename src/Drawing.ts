import { cssForColorIndex } from "./Colors.ts";

interface Point {
  x: number;
  y: number;
}

export class Plotter {
  cursor: Point;
  windowToView: WindowToViewTransform;

  constructor(screenWidth: number, screenHeight: number) {
    this.cursor = {x: Math.floor(screenWidth / 2), y: Math.floor(screenHeight / 2)};
    this.windowToView = new WindowToViewTransform(screenWidth, screenHeight);
  }

  setPixel(ctx: CanvasRenderingContext2D, x: number, y: number, colorIndex: number, step?: boolean) {
    const pw = step ? {x: x + this.cursor.x, y: y + this.cursor.y} : {x, y};
    const pv = this.windowToView.transform(pw);
    ctx.fillStyle = cssForColorIndex(colorIndex);
    ctx.fillRect(pv.x, pv.y, 1, 1);
    this.cursor = pw;
  }

  setWindow(p1: Point, p2: Point, screen?: boolean) {
    this.windowToView.setWindow(p1, p2, screen);
  }

  setView(p1: Point, p2: Point, screen?: boolean) {
    this.windowToView.setView(p1, p2, screen);
  }
}

type Range = number[];

interface Region {
  x: Range;
  y: Range;
}

class WindowToViewTransform {
  window: Region;
  view: Region;
  x0: number;
  y0: number;
  dx: number;
  dy: number;

  constructor(screenWidth: number, screenHeight: number) {
    this.window = {x: [0, screenWidth - 1], y: [0, screenHeight - 1]};
    this.view = {x: [0, screenWidth - 1], y: [0, screenHeight - 1]};
    this.update();
  }

  private update() {
    [this.x0, this.dx] = remapRange(this.window.x, this.view.x);
    [this.y0, this.dy] = remapRange(this.window.y, this.view.y);
  }

  setWindow(p1: Point, p2: Point, screen?: boolean) {
    this.window = pointsToRegion(p1, p2, !!screen);
    this.update();
  }

  setView(p1: Point, p2: Point, screen?: boolean) {
    this.view = pointsToRegion(p1, p2, !!screen);
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
  const dx = (from[1] - from[0]) / (to[1] - to[0]);
  const x0 = (from[1] * to[0] - from[0] * to[1]) / (to[1] - to[0]);
  return [x0, dx];
}

function pointsToRegion(p1: Point, p2: Point, invertY: boolean): Region {
  return {
    x: [Math.min(p1.x, p2.x), Math.max(p1.x, p2.x)],
    y: invertY ?
      [Math.max(p1.y, p2.y), Math.min(p1.y, p2.y)] :
      [Math.min(p1.y, p2.y), Math.max(p1.y, p2.y)]
  }
}