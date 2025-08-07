import { Devices } from "./Devices.ts";
import { Joystick } from "./Joystick.ts";
import { Keyboard } from "./Keyboard.ts";
import { LightPen } from "./LightPen.ts";
import { Modem } from "./Modem.ts";
import { Speaker } from "./Speaker.ts";
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
  lightPen: LightPenEventMonitor;
  play: PlayEventMonitor;
  modem: ModemEventMonitor;
  devices: Devices;
  asleep?: SleepArgs;

  constructor(devices: Devices) {
    this.devices = devices;
    this.timer = new TimerEventMonitor(devices.timer);
    this.joystick = new JoystickEventMonitor(devices.joystick);
    this.keyboard = new KeyboardEventMonitor(devices.keyboard);
    this.lightPen = new LightPenEventMonitor(devices.lightPen);
    this.play = new PlayEventMonitor(devices.speaker);
    this.modem = new ModemEventMonitor(devices.modem);
  }

  poll(): Trap | void {
    this.timer.poll();
    this.joystick.poll();
    this.keyboard.poll();
    this.lightPen.poll();
    this.play.poll();
    this.modem.poll();
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
      this.keyboard.trap() ||
      this.lightPen.trap() ||
      this.play.trap() ||
      this.modem.trap()
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
  targetIndex?: number;

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
        if (channel.targetIndex === undefined) {
          return;
        }
        return {
          targetIndex: channel.targetIndex,
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
    // This maps a generic xbox gamepad's "A" button to the "lower" button and
    // "B" button to the "upper" button.
    const buttons = [
      !!state[0]?.stickyButtons[1],
      !!state[1]?.stickyButtons[1],
      !!state[0]?.stickyButtons[0],
      !!state[1]?.stickyButtons[0],
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

export class LightPenEventMonitor extends EventMonitor {
  constructor(private lightPen: LightPen) {
    super(1);
  }

  override poll() {
    const channel = this.channels[0];
    if (!channel.isDisabled()) {
      const state = this.lightPen.getState();
      if (state.stickyPressed) {
        channel.triggered = true;
      }
    }
  }
}

export class PlayEventMonitor extends EventMonitor {
  queueLimit: number = 0;
  aboveLimit: boolean;

  constructor(private speaker: Speaker) {
    super(1);
  }

  override configure(queueLimit: number, targetIndex: number) {
    this.queueLimit = queueLimit;
    super.configure(0, targetIndex);
  }

  override setState(channelIndex: number, state: EventChannelState) {
    if (state === EventChannelState.OFF) {
      this.aboveLimit = false;
      this.queueLimit = 0;
    }
    super.setState(channelIndex, state);
  }

  override poll() {
    const channel = this.channels[0];
    if (!channel.isDisabled()) {
      const state = this.speaker.getPlayState();
      if (!state.playInBackground) {
        return;
      }
      const queueLength = this.speaker.getNoteQueueLength();
      if (queueLength >= this.queueLimit) {
        this.aboveLimit = true;
      }
      if (this.aboveLimit && queueLength < this.queueLimit) {
        this.aboveLimit = false;
        channel.triggered = true;
      }
    }
  }
}

export class ModemEventMonitor extends EventMonitor {
  constructor(private modem: Modem) {
    super(1);
  }

  override poll() {
    const channel = this.channels[0];
    if (!channel.isDisabled()) {
      if (this.modem.checkForNewInput()) {
        channel.triggered = true;
      }
    }
  }
}