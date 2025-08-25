export interface Joystick {
  getState(): JoystickState[]
  resetCount(): void;
  sample(): [number, JoystickState[]];
  testTrigger?(buttonIndex: number): void;
}

export interface JoystickState {
  buttons: boolean[];
  stickyButtons: boolean[];
  axes: number[];
  scaledAxes: number[];
}

const IDLE_STICK = {
  buttons: [false, false],
  stickyButtons: [false, false],
  axes: [0, 0],
  // Always sample as low when no joystick is attached.
  scaledAxes: [0, 0],
};

export class TestJoystick implements Joystick {
  state: JoystickState[] = [{...IDLE_STICK}, {...IDLE_STICK}];
  strobeCount = 0;

  getState(): JoystickState[] {
    const result = this.state.map((state) => ({...state}));
    for (const joystick of this.state) {
      joystick.stickyButtons = joystick.buttons.map((_value) => false);
    }
    return result;
  }

  resetCount() {
    this.strobeCount = 0;
  }

  sample(): [number, JoystickState[]] {
    return [this.strobeCount++, this.state.map((state) => ({...state}))];
  }

  testTrigger(buttonIndex: number) {
    // buttonIndex is from strig so must match what JoystickEventMonitor expects.
    switch (buttonIndex) {
      case 0:
        this.state[0].stickyButtons[1] = true;
        break;
      case 1:
        this.state[1].stickyButtons[1] = true;
        break;
      case 2:
        this.state[0].stickyButtons[0] = true;
        break;
      case 3:
        this.state[1].stickyButtons[0] = true;
        break;
    }
  }
}

export class GamepadListener implements Joystick {
  state: JoystickState[] = [{...IDLE_STICK}, {...IDLE_STICK}];
  strobeCount = 0;

  getState(): JoystickState[] {
    const result = this.state.map((state) => ({...state}));
    for (const joystick of this.state) {
      joystick.stickyButtons = joystick.buttons.map((_value) => false);
    }
    return result;
  }

  resetCount() {
    this.strobeCount = 0;
  }

  sample(): [number, JoystickState[]] {
    return [this.strobeCount++, this.state.map((state) => ({...state}))];
  }

  update() {
    const gamepads = navigator.getGamepads();
    for (const gamepad of gamepads) {
      if (!gamepad) {
        continue;
      }
      const oldState = this.state[gamepad.index];
      const state: JoystickState = {
        buttons: gamepad.buttons.map((button) => button.pressed),
        stickyButtons: gamepad.buttons.map((button, index) =>
          (oldState?.stickyButtons[index] ?? false) || button.pressed
        ),
        axes: gamepad.axes.slice(),
        scaledAxes: gamepad.axes.map(scalePosition),
      };
      this.state[gamepad.index] = state;
    }
  }
}

const MIN_STICK = 1;
const MAX_STICK = 200;

function scalePosition(position: number) {
  const t = (position + 1) / 2;
  const scaledPosition = Math.floor((1 - t) * MIN_STICK + t * MAX_STICK);
  return scaledPosition;
}