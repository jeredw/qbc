export class RandomNumbers {
  state: number;

  constructor() {
    this.state = 0;
  }

  setSeed(value: number) {
    this.state = value;
  }

  getRandom(): number {
    this.state = (this.state * 0xfd43fd + 0xc39ec3) & 0xffffff;
    return this.state / 0x1000000;
  }
}