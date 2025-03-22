import { Devices } from "./Devices.ts";

export interface Trap {
  targetIndex: number;
  trap: EventTrap;
}

export class Events {
  timer: TimerEventTrap;

  constructor() {
    this.timer = new TimerEventTrap();
  }

  poll(devices: Devices) {
    this.timer.poll(devices);
  }

  trap(devices: Devices): Trap | void {
    const timer = this.timer.trap(devices);
    if (timer) {
      return timer;
    }
  }
}

export enum EventTrapState {
  ON,
  OFF,
  STOPPED
}

export abstract class EventTrap {
  state: EventTrapState;
  triggered: boolean = false;
  targetIndex?: number;

  constructor() {
    this.state = EventTrapState.OFF;
  }

  setState(state: EventTrapState) {
    this.state = state;
    if (state === EventTrapState.OFF) {
      this.triggered = false;
    }
  }

  enableIfStopped() {
    if (this.state === EventTrapState.STOPPED) {
      this.setState(EventTrapState.ON);
    }
  }

  stop() {
    this.state = EventTrapState.STOPPED;
  }

  isDisabled(): boolean {
    return this.state === EventTrapState.OFF;
  }

  isStopped(): boolean {
    return this.state === EventTrapState.STOPPED;
  }

  abstract poll(devices: Devices): void;

  abstract trap(devices: Devices): Trap | void;
}

export class TimerEventTrap extends EventTrap {
  startTime: number | undefined;
  duration: number = 1;

  constructor() {
    super();
  }

  start(startTime: number, duration: number, targetIndex: number) {
    this.startTime = startTime;
    this.duration = duration;
    this.targetIndex = targetIndex;
  }

  override poll(devices: Devices) {
    if (this.isDisabled()) {
      return;
    }
    if (this.startTime === undefined) {
      return;
    }
    const now = devices.timer.timer();
    if (now >= this.startTime + this.duration) {
      this.triggered = true;
    }
  }

  override trap(devices: Devices): Trap | void {
    if (this.isStopped()) {
      return;
    }
    if (this.triggered) {
      this.stop();
      this.startTime = devices.timer.timer();
      this.triggered = false;
      return {targetIndex: this.targetIndex!, trap: this};
    }
  }
}