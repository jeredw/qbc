import { Devices } from "./Devices.ts";
import { Joystick } from "./Joystick.ts";
import { Keyboard } from "./Keyboard.ts";
import { Timer } from "./Timer.ts";

export interface Trap {
  targetIndex: number;
  reenableEvents: () => void;
}

export interface SleepArgs {
  start: number;
  duration: number;
  numKeysPending: number;
}

export class Events {
  timer: TimerEventMonitor;
  joystick: JoystickEventMonitor;
  keyboard: KeyboardEventMonitor;
  devices: Devices;
  asleep?: SleepArgs;

  constructor(devices: Devices) {
    this.devices = devices;
    this.timer = new TimerEventMonitor(devices.timer);
    this.joystick = new JoystickEventMonitor(devices.joystick);
    this.keyboard = new KeyboardEventMonitor(devices.keyboard);
  }

  poll(): Trap | void {
    this.timer.poll();
    this.joystick.poll();
    this.keyboard.poll();
    if (this.asleep) {
      if (this.asleep.duration !== 0 &&
          this.devices.timer.timer() >= this.asleep.start + this.asleep.duration) {
        this.wakeUp();
      } else if (this.devices.keyboard.numKeysPending() > this.asleep.numKeysPending) {
        this.wakeUp();
      }
    }
    const result = (
      this.timer.trap() ||
      this.joystick.trap() ||
      this.keyboard.trap()
    );
    if (result) {
      this.wakeUp();
    }
    return result;
  }

  sleep(asleep: SleepArgs) {
    this.asleep = asleep;
  }

  private wakeUp() {
    this.asleep = undefined;
  }

  sleeping(): boolean {
    return !!this.asleep;
  }
}

export enum EventChannelState {
  ON,
  OFF,
  STOPPED,
  TEST
}

class EventChannel {
  state: EventChannelState = EventChannelState.OFF;
  triggered: boolean = false;
  targetIndex: number;

  setState(state: EventChannelState) {
    this.state = state;
    if (state === EventChannelState.OFF) {
      this.triggered = false;
    }
  }

  isDisabled(): boolean {
    return this.state === EventChannelState.OFF;
  }

  isStopped(): boolean {
    return this.state === EventChannelState.STOPPED;
  }
}

export abstract class EventMonitor {
  channels: EventChannel[];

  constructor(numChannels: number) {
    this.channels = [];
    for (let i = 0; i < numChannels; i++) {
      this.channels[i] = new EventChannel();
    }
  }

  configure(channelIndex: number, targetIndex: number) {
    this.channels[channelIndex].targetIndex = targetIndex;
  }

  setState(channelIndex: number, state: EventChannelState) {
    this.channels[channelIndex].setState(state);
  }

  abstract poll(): void;

  trap(): Trap | void {
    for (let channelIndex = 0; channelIndex < this.channels.length; channelIndex++) {
      const channel = this.channels[channelIndex];
      if (channel.isStopped()) {
        continue;
      }
      if (channel.triggered) {
        this.setState(channelIndex, EventChannelState.STOPPED);
        channel.triggered = false;
        return {
          targetIndex: channel.targetIndex!,
          reenableEvents: () => {
            if (!channel.isDisabled()) {
              this.setState(channelIndex, EventChannelState.ON);
            }
          },
        };
      }
    }
  }
}

export class TimerEventMonitor extends EventMonitor {
  startTime: number | undefined;
  duration: number = 1;

  constructor(private timer: Timer) {
    super(1);
  }

  override configure(duration: number, targetIndex: number) {
    this.duration = duration;
    super.configure(0, targetIndex);
  }

  override setState(channelIndex: number, state: EventChannelState) {
    if (state === EventChannelState.OFF) {
      this.startTime = undefined;
    } else if (this.startTime === undefined) {
      this.startTime = this.timer.timer();
    }
    super.setState(channelIndex, state);
  }

  override poll() {
    if (this.channels[0].isDisabled()) {
      return;
    }
    if (this.startTime === undefined) {
      return;
    }
    const now = this.timer.timer();
    if (now >= this.startTime + this.duration) {
      this.startTime = undefined;
      this.channels[0].triggered = true;
    }
  }
}

export class JoystickEventMonitor extends EventMonitor {
  constructor(private joystick: Joystick) {
    super(4);
  }

  override poll() {
    const state = this.joystick.getState();
    const buttons = [
      !!state[0]?.stickyButtons[0],
      !!state[0]?.stickyButtons[1],
      !!state[1]?.stickyButtons[0],
      !!state[1]?.stickyButtons[1],
    ];
    for (let channelIndex = 0; channelIndex < 4; channelIndex++) {
      const channel = this.channels[channelIndex];
      if (!channel.isDisabled() && buttons[channelIndex]) {
        channel.triggered = true;
      }
    }
  }
}

export class KeyboardEventMonitor extends EventMonitor {
  constructor(private keyboard: Keyboard) {
    super(32);
  }

  override setState(channelIndex: number, state: EventChannelState) {
    const enable = state !== EventChannelState.OFF;
    this.keyboard.monitorKey(channelIndex, enable);
    super.setState(channelIndex, state);
  }

  override poll() {
    for (let channelIndex = 1; channelIndex < 32; channelIndex++) {
      const channel = this.channels[channelIndex];
      if (!channel.isDisabled()) {
        const newKeyPress = this.keyboard.checkKey(channelIndex);
        if (newKeyPress) {
          channel.triggered = true;
        }
      }
    }
  }
}