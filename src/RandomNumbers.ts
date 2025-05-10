export class RandomNumbers {
  state: number;

  constructor() {
    this.state = 0;
  }

  setSeed(seed: number) {
    this.state = seed;
  }

  getRandom(advance: boolean): number {
    if (advance) {
      this.state = (this.state * 0xfd43fd + 0xc39ec3) & 0xffffff;
    }
    return this.state / 0x1000000;
  }
}