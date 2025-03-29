export interface LightPen {
  getState(): LightPenState;
  testPress?(): void;
}

export interface LightPenTarget {
  triggerPen(x: number, y: number): LightPenTrigger | void;
}

export interface LightPenTrigger {
  row: number;
  column: number;
  x: number;
  y: number;
}

export interface LightPenState {
  pressed: boolean;
  stickyPressed: boolean;
  lastTrigger: LightPenTrigger;
  lastPress: LightPenTrigger;
}

export class PointerListener implements LightPen {
  state: LightPenState;

  constructor(private target: LightPenTarget) {
    this.state = {
      pressed: false,
      stickyPressed: false,
      lastTrigger: {row: 0, column: 0, x: 0, y: 0},
      lastPress: {row: 0, column: 0, x: 0, y: 0},
    };
  }

  testPress() {
    this.state.pressed = false;
    this.state.stickyPressed = true;
  }

  pointerdown(e: PointerEvent) {
    const {offsetX, offsetY} = e;
    const trigger = this.target.triggerPen(offsetX, offsetY);
    if (trigger) {
      this.state.pressed = true;
      this.state.stickyPressed = true;
      this.state.lastPress = trigger;
      this.state.lastTrigger = trigger;
    }
  }

  pointerup(e: PointerEvent) {
    this.state.pressed = false;
    this.track(e);
  }

  pointermove(e: PointerEvent) {
    this.track(e);
  }

  private track(e: PointerEvent) {
    const {offsetX, offsetY} = e;
    const trigger = this.target.triggerPen(offsetX, offsetY);
    if (trigger) {
      this.state.lastTrigger = trigger;
    }
  }

  getState(): LightPenState {
    const state = {...this.state};
    this.state.stickyPressed = false;
    return state;
  }
}