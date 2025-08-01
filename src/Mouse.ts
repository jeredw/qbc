export interface Mouse {
  showCursor(): void;
  hideCursor(): void;
  getState(): MouseState;
  getButtonState(buttonMask: number, down: boolean): MouseButtonState;
}

export interface MouseButtonState {
  lastDownX: number;
  lastDownY: number;
  lastUpX: number;
  lastUpY: number;
  stickyDownCount: number;
  stickyUpCount: number;
}

const DEFAULT_BUTTON_STATE = {
  lastDownX: 0,
  lastDownY: 0,
  lastUpX: 0,
  lastUpY: 0,
  stickyDownCount: 0,
  stickyUpCount: 0,
};

export interface MouseState {
  x: number;
  y: number;
  buttonMask: number;
}

export interface MouseSurface {
  showMouseCursor(x: number, y: number): void;
  hideMouseCursor(): void;
  scaleMouseCoordinates(x: number, y: number): {x: number, y: number};
}

export class MouseListener implements Mouse {
  private state: MouseState;
  private buttonState: MouseButtonState[];

  constructor(
    private surface: MouseSurface,
    private cursor = false,
  ) {
    this.state = {x: 0, y: 0, buttonMask: 0};
    this.buttonState = [
      {...DEFAULT_BUTTON_STATE},
      {...DEFAULT_BUTTON_STATE},
      {...DEFAULT_BUTTON_STATE},
    ];
  }

  showCursor() {
    this.cursor = true;
    this.surface.showMouseCursor(this.state.x, this.state.y);
  }

  hideCursor() {
    this.cursor = false;
    this.surface.hideMouseCursor();
  }

  getState(): MouseState {
    return {...this.state};
  }

  getButtonState(buttonMask: number, down: boolean): MouseButtonState {
    const index = (
      buttonMask & 1 ? 0 :
      buttonMask & 2 ? 1 :
      2
    );
    const result = {...this.buttonState[index]};
    if (down) {
      this.buttonState[index].stickyDownCount = 0;
    } else {
      this.buttonState[index].stickyUpCount = 0;
    }
    return result;
  }

  mousedown(e: MouseEvent) {
    this.updatePosition(e);
    this.state.buttonMask = e.buttons;
    for (let i = 0; i < 2; i++) {
      if (e.buttons & (1 << i)) {
        this.buttonState[i].lastUpX = this.state.x;
        this.buttonState[i].lastUpY = this.state.y;
        this.buttonState[i].stickyUpCount++;
      }
    }
  }

  mouseup(e: MouseEvent) {
    this.updatePosition(e);
    this.state.buttonMask = e.buttons;
    for (let i = 0; i < 2; i++) {
      if (e.buttons & (1 << i)) {
        this.buttonState[i].lastDownX = this.state.x;
        this.buttonState[i].lastDownY = this.state.y;
        this.buttonState[i].stickyDownCount++;
      }
    }
  }

  mousemove(e: MouseEvent) {
    this.updatePosition(e);
    if (this.cursor) {
      const {x, y} = this.state;
      this.surface.showMouseCursor(x, y);
    }
  }

  private updatePosition(e: MouseEvent) {
    const {offsetX, offsetY} = e;
    const {x, y} = this.surface.scaleMouseCoordinates(offsetX, offsetY);
    this.state.x = x;
    this.state.y = y;
  }
}