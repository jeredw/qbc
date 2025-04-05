export interface Speaker {
  beep(): Promise<void>;
  getNoteQueueLength(): number;
  getPlayState(): PlayState;
  setPlayState(state: PlayState): void;
  tone(frequency: number, onDuration: number, offDuration: number): Promise<void>;

  testFinishNote?(): void;
}

export interface PlayState {
  playInBackground: boolean;
  octave: number;
  noteLength: number;
  tempo: number;
  onFraction: number;
}

export const DEFAULT_PLAY_STATE: PlayState = {
  playInBackground: false,
  octave: 4,
  noteLength: 4,
  tempo: 120,
  onFraction: .875,
};

export class TestSpeaker implements Speaker {
  output: string = "";
  playState: PlayState = DEFAULT_PLAY_STATE;
  queueLength: number = 0;

  beep(): Promise<void> {
    this.output += 'SPEAKER> beep\n';
    return Promise.resolve();
  }

  getNoteQueueLength(): number {
    return this.queueLength;
  }

  getPlayState(): PlayState {
    return this.playState;
  }

  setPlayState(playState: PlayState) {
    this.playState = playState;
    this.output += `SPEAKER> playState = ${JSON.stringify(this.playState)}\n`;
  }

  testFinishNote(): void {
    if (this.queueLength > 0) {
      this.queueLength--;
    }
  }

  tone(frequency: number, onDuration: number, offDuration: number): Promise<void> {
    this.output += `SPEAKER> tone(${frequency}, ${onDuration}, ${offDuration})\n`;
    this.queueLength++;
    return Promise.resolve();
  }
}

interface Note {
  frequency: number;
  onTime: number;
  offTime: number;
  endTime: number;
  done: boolean;
  promise: Promise<void>;
}

export class WebAudioSpeaker implements Speaker {
  audioContext: AudioContext;
  oscillator: OscillatorNode;
  gainNode: GainNode;
  queue: Note[] = [];
  playState: PlayState;

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
    this.playState = DEFAULT_PLAY_STATE;
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

  getNoteQueueLength(): number {
    this.syncQueue();
    return this.queue.length;
  }

  getPlayState(): PlayState {
    return this.playState;
  }

  setPlayState(state: PlayState): void {
    this.playState = state;
  }

  tone(frequency: number, onDuration: number, offDuration: number): Promise<void> {
    this.syncQueue();
    const now = this.audioContext.currentTime;
    const onTime = this.queue.at(-1)?.endTime ?? now;
    const offTime = onTime + onDuration;
    const endTime = offTime + offDuration;
    const promise: Promise<void> = new Promise((resolve) => {
      const duration = 1000 * (endTime - now);
      setTimeout(() => {
        note.done = true;
        resolve();
      }, duration);
    });
    const note = {frequency, onTime, offTime, endTime, promise, done: false};
    this.queue.push(note);
    this.oscillator.frequency.setValueAtTime(frequency, onTime);
    this.gainNode.gain.setValueAtTime(1, onTime);
    this.gainNode.gain.setValueAtTime(0, offTime);
    if (!this.playState.playInBackground && this.queue.length > 2) {
      return this.queue[0].promise;
    }
    return Promise.resolve();
  }

  private syncQueue() {
    while (this.queue[0]?.done) {
      this.queue.shift();
    }
  }
}