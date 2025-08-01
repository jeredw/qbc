export interface Mouse {
  showCursor(): void;
  hideCursor(): void;
}

export interface MouseSurface {
  showMouseCursor(x: number, y: number): void;
  hideMouseCursor(): void;
}

export class MouseListener implements Mouse {
  constructor(
    private surface: MouseSurface,
    private cursor = false,
    private x = 0,
    private y = 0,
  ) {
  }

  showCursor() {
    this.cursor = true;
    this.surface.showMouseCursor(this.x, this.y);
  }

  hideCursor() {
    this.cursor = false;
    this.surface.hideMouseCursor();
  }

  mousedown(e: MouseEvent) {
  }

  mouseup(e: MouseEvent) {
  }

  mousemove(e: MouseEvent) {
    const {offsetX, offsetY} = e;
    if (this.cursor) {
      this.surface.showMouseCursor(offsetX, offsetY);
    }
  }
}