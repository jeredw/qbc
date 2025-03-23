export interface Joystick {
  getState(n: number): JoystickState
}

export interface JoystickState {
  buttons: boolean[];
  stickyButtons: boolean[];
  axes: number[];
}

export class TestJoystick implements Joystick {
  constructor() {
  }

  getState(n: number): JoystickState {
    return {
      buttons: [false, false],
      stickyButtons: [false, false],
      axes: [0, 0]
    };
  }
}

export class GamepadListener implements Joystick {
  state: JoystickState[] = [];

  getState(n: number): JoystickState {
    if (!this.state[n]) {
      return {
        buttons: [false, false],
        stickyButtons: [false, false],
        axes: [0, 0]
      };
    }
    const state = {...this.state[n]};
    this.state[n].stickyButtons = Array(state.buttons.length).fill(false);
    return state;
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
        axes: gamepad.axes.slice()
      };
      this.state[gamepad.index] = state;
    }
  }
}