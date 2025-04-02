export interface Speaker {
  beep(): Promise<void>;
  tone(frequency: number, durationInTicks: number): Promise<void>;
}

export class TestSpeaker implements Speaker {
  output: string = "";

  beep(): Promise<void> {
    this.output += 'SPEAKER> beep\n';
    return Promise.resolve();
  }

  tone(frequency: number, duration: number): Promise<void> {
    this.output += `SPEAKER> tone(${frequency}, ${duration})\n`;
    return Promise.resolve();
  }
}

const TICKS_PER_SECOND = 1193180 / 65535;

interface Note {
  frequency: number;
  startTime: number;
  endTime: number;
  done: boolean;
}

export class WebAudioSpeaker implements Speaker {
  audioContext: AudioContext;
  oscillator: OscillatorNode;
  gainNode: GainNode;
  queue: Note[] = [];

  constructor() {
    this.reset();
  }

  tick() {
  }

  enable() {
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  disable() {
    if (this.audioContext.state !== 'suspended') {
      this.audioContext.suspend();
    }
  }

  beep(): Promise<void> {
    this.oscillator.frequency.value = 900;
    this.gainNode.gain.value = 1;
    return new Promise((resolve) => {
      setTimeout(() => {
        this.gainNode.gain.value = 0;
        resolve();
      }, 300)
    });
  }

  reset() {
    if (this.oscillator) {
      // Make horrible beeping stop from last time.
      this.oscillator.stop();
    }
    this.audioContext = new AudioContext();
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
    this.gainNode.gain.value = 0;
    this.oscillator = this.audioContext.createOscillator();
    this.oscillator.type = "square";
    this.oscillator.connect(this.gainNode);
    this.oscillator.start();
    this.queue = [];
  }

  tone(frequency: number, durationInTicks: number): Promise<void> {
    const now = this.audioContext.currentTime;
    while (this.queue[0]?.done) {
      this.queue.shift();
    }
    const startTime = this.queue.at(-1)?.endTime ?? now;
    const duration = durationInTicks / TICKS_PER_SECOND;
    const endTime = startTime + duration;
    const note = {frequency, startTime, endTime, done: false};
    this.queue.push(note);
    setTimeout(() => { note.done = true }, 1000 * (endTime - now));
    this.oscillator.frequency.setValueAtTime(frequency, startTime);
    this.gainNode.gain.setValueAtTime(1, startTime);
    this.gainNode.gain.setValueAtTime(0, startTime + duration);
    if (this.queue.length > 2) {
      const waitMs = 1000 * (this.queue[0].endTime - now);
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve();
        }, waitMs);
      });
    }
    return Promise.resolve();
  }
}