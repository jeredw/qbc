export interface Timer {
  timer(): number
}

export class TestTimer {
  private time = 0;

  timer() {
    const timestamp = this.time;
    this.time++;
    return timestamp;
  }
}

const BASE_FREQUENCY = 1193180;

export class RealTimeTimer {
  divisor: number = 65535;
  frequency: number;

  constructor() {
    this.frequency = BASE_FREQUENCY / this.divisor;
  }

  timer(): number {
    const now = new Date();
    const midnight = new Date(now.valueOf());
    midnight.setHours(0, 0, 0, 0);
    const msSinceMidnight = now.valueOf() - midnight.valueOf();
    const period = 1 / this.frequency;
    const timestamp = period * Math.floor((msSinceMidnight / 1000) / period);
    return +timestamp.toFixed(2);
  }
}