export interface Joystick {
  getState(): JoystickState[]
  testTrigger?(buttonIndex: number): void;
}

export interface JoystickState {
  buttons: boolean[];
  stickyButtons: boolean[];
  axes: number[];
}

const IDLE_STICK = {
  buttons: [false, false],
  stickyButtons: [false, false],
  axes: [0, 0]
};

export class TestJoystick implements Joystick {
  state: JoystickState[] = [{...IDLE_STICK}, {...IDLE_STICK}];

  getState(): JoystickState[] {
    const result = this.state.map((state) => ({...state}));
    for (const joystick of this.state) {
      joystick.stickyButtons = joystick.buttons.map((_value) => false);
    }
    return result;
  }

  testTrigger(buttonIndex: number) {
    switch (buttonIndex) {
      case 0:
        this.state[0].stickyButtons[0] = true;
        break;
      case 1:
        this.state[0].stickyButtons[1] = true;
        break;
      case 2:
        this.state[1].stickyButtons[0] = true;
        break;
      case 3:
        this.state[1].stickyButtons[1] = true;
        break;
    }
  }
}

export class GamepadListener implements Joystick {
  state: JoystickState[] = [{...IDLE_STICK}, {...IDLE_STICK}];

  getState(): JoystickState[] {
    const result = this.state.map((state) => ({...state}));
    for (const joystick of this.state) {
      joystick.stickyButtons = joystick.buttons.map((_value) => false);
    }
    return result;
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