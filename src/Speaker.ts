export interface Speaker {
  beep: () => Promise<void>;
}

export class TestSpeaker implements Speaker {
  output: string = "";

  beep(): Promise<void> {
    this.output += 'BEEP';
    return Promise.resolve();
  }
}

export class WebAudioSpeaker implements Speaker {
  audioContext?: AudioContext;
  oscillator: OscillatorNode;

  constructor() {
  }

  enable() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    } else {
      this.audioContext.resume();
    }
  }

  disable() {
    if (this.audioContext) {
      this.audioContext.suspend();
    }
  }

  beep(): Promise<void> {
    let oscillator: OscillatorNode;
    if (this.audioContext) {
      oscillator = this.audioContext.createOscillator();
      oscillator.type = "square";
      oscillator.frequency.value = 900;
      oscillator.connect(this.audioContext.destination);
      oscillator.start();
    }
    return new Promise((resolve) => {
      setTimeout(() => {
        if (oscillator) {
          oscillator.disconnect();
        }
        resolve();
      }, 300)
    });
  }
}