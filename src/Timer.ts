export interface Timer {
  setDate(month: number, dateOfMonth: number, fullYear: number): void;
  date(): string;
  setTime(hours: number, minutes: number, seconds: number): void;
  time(): string;
  timer(): number;
  rawTicks(): number;

  testTick?(): void;
}

export class TestTimer {
  private ticks = 0;
  private currentDate = "09-21-1988";
  private currentTime = "15:01:59";

  setDate(month: number, dateOfMonth: number, fullYear: number) {
    this.currentDate = `${pad(month)}-${pad(dateOfMonth)}-${fullYear}`;
  }

  date(): string {
    return this.currentDate;
  }

  setTime(hours: number, minutes: number, seconds: number) {
    this.currentTime = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  time(): string {
    return this.currentTime;
  }

  timer() {
    return this.ticks;
  }

  rawTicks() {
    return this.ticks;
  }

  testTick() {
    this.ticks++;
  }
}

const BASE_FREQUENCY = 1193180;

export class RealTimeTimer {
  divisor: number = 65535;
  frequency: number;
  dateOffset: number = 0;
  timeOffset: number = 0;

  constructor() {
    this.frequency = BASE_FREQUENCY / this.divisor;
  }

  private now(): Date {
    return new Date(Date.now() + this.dateOffset + this.timeOffset);
  }

  setDate(month: number, dateOfMonth: number, fullYear: number) {
    const now = this.now();
    const then = new Date(now);
    then.setMonth(month - 1);
    then.setDate(dateOfMonth);
    then.setFullYear(fullYear);
    this.dateOffset += then.getTime() - now.getTime();
  }

  date(): string {
    const now = this.now();
    return `${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${now.getFullYear()}`
  }

  setTime(hours: number, minutes: number, seconds: number) {
    const now = this.now();
    const then = new Date(now);
    then.setHours(hours);
    then.setMinutes(minutes);
    then.setSeconds(seconds);
    this.timeOffset += then.getTime() - now.getTime();
  }

  time(): string {
    const now = this.now();
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  }

  timer(): number {
    const now = this.now();
    const midnight = new Date(now.valueOf());
    midnight.setHours(0, 0, 0, 0);
    const msSinceMidnight = now.valueOf() - midnight.valueOf();
    const period = 1 / this.frequency;
    const timestamp = period * Math.floor((msSinceMidnight / 1000) / period);
    return +timestamp.toFixed(2);
  }

  rawTicks(): number {
    const now = this.now();
    const midnight = new Date(now.valueOf());
    midnight.setHours(0, 0, 0, 0);
    const msSinceMidnight = now.valueOf() - midnight.valueOf();
    const msPerTick = 1000 / this.frequency;
    return Math.floor(msSinceMidnight / msPerTick);
  }
}

function pad(n: number) {
  return ('' + n).padStart(2, '0');
}