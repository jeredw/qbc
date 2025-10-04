import { Scheduler } from "./Scheduler.ts";
import { Synthesizer } from "./Synthesizer.ts";
import type { PlayerElement } from "./midi-player.d.ts";

export interface Speaker {
  beep(): Promise<void>;
  getNoteQueueLength(): number;
  getPlayState(): PlayState;
  setPlayState(state: PlayState): void;
  tone(frequency: number, onDuration: number, offDuration: number): Promise<void>;

  playSample(data: Uint8Array, sampleRate: number): void;
  writeSynthesizerData(address: number, data: number): void;
  readSynthesizerStatus(): number;

  loadMidi(data: Uint8Array): void;
  playMidi({restart, loop}: {restart: boolean, loop?: boolean}): void;
  stopMidi(): void;
  playingMidi(): boolean;

  setScheduler(scheduler: Scheduler): void;
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
  playState: PlayState = {...DEFAULT_PLAY_STATE};
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

  playSample(data: Uint8Array, sampleRate: number) {
    this.output += `SPEAKER> play sample ${data.byteLength} ${sampleRate}`;
  }

  writeSynthesizerData(address: number, data: number) {
    this.output += `SPEAKER> write synthesizer data ${address} ${data}`;
  }

  readSynthesizerStatus(): number {
    this.output += `SPEAKER> read synthesizer status`;
    return 0;
  }

  loadMidi(data: Uint8Array) {
    this.output += `SPEAKER> load midi ${data.byteLength}`;
  }

  playMidi({restart, loop}: {restart: boolean, loop?: boolean}) {
    this.output += `SPEAKER> play midi restart=${restart} loop=${loop}`;
  }

  stopMidi() {
    this.output += `SPEAKER> stop midi`;
  }

  playingMidi(): boolean {
    this.output += `SPEAKER> playing midi?`;
    return false;
  }

  setScheduler(scheduler: Scheduler) {
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
  bufferSource?: AudioBufferSourceNode;
  gainNode: GainNode;
  synthesizer: Synthesizer = new Synthesizer();
  queue: Note[] = [];
  playState: PlayState;
  scheduler: Scheduler;
  enabled = false;
  private midiStillLoading = false;
  private pendingPlayMidi?: () => void;
  private playedNotesSinceReset = false;

  constructor(private midiPlayer: PlayerElement) {
    this.reset();
  }

  tick() {
  }

  enable() {
    this.enabled = true;
    if (this.audioContext.state === 'suspended') {
      // Reset note queue since it will have system timestamps.
      this.queue = [];
      this.audioContext.resume();
      // The midi player thing uses Tone.js under the hood which has this start method.
      window['Tone'] && window['Tone'].start?.();
      this.midiPlayer.start();
    }
  }

  disable() {
    this.enabled = false;
    if (this.audioContext.state !== 'suspended') {
      // Reset note queue since it will have audiocontext timestamps.
      this.queue = [];
      this.audioContext.suspend();
      // Tone does not appear to have a stop method.
      this.midiPlayer.stop();
    }
  }

  reset() {
    if (this.oscillator) {
      // Make horrible beeping stop from last time.
      this.oscillator.stop();
    }
    if (this.bufferSource) {
      this.bufferSource.disconnect();
      this.bufferSource = undefined;
    }
    this.stopMidi();
    this.audioContext = new AudioContext();
    this.synthesizer.connect(this.audioContext);
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
    this.gainNode.gain.value = 0;
    this.oscillator = this.audioContext.createOscillator();
    this.oscillator.type = "square";
    this.oscillator.connect(this.gainNode);
    this.oscillator.start();
    if (!this.enabled) {
      this.audioContext.suspend();
    }
    this.queue = [];
    this.playState = {...DEFAULT_PLAY_STATE};
  }

  beep(): Promise<void> {
    let offTimer: number | undefined;
    return this.scheduler.schedule({
      start: (resolve) => {
        this.oscillator.frequency.value = 900;
        this.gainNode.gain.value = 1;
        offTimer = setTimeout(() => {
          this.gainNode.gain.value = 0;
          resolve();
        }, 300)
      },
      cancel: () => {
        clearTimeout(offTimer);
        this.gainNode.gain.value = 0;
      }
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
    // If the audiocontext is suspended, its clock won't advance, but we ned to
    // time notes correctly anyway since some programs rely on this for timing.
    const now = this.enabled ? this.audioContext.currentTime : performance.now() / 1000;
    if (onDuration === 0 && offDuration === 0) {
      if (this.playedNotesSinceReset) {
        // Don't reset the audio context a ton if there is a run of SOUND ... O commands.
        // This breaks audio in Chrome.
        this.playedNotesSinceReset = false;
        this.reset();
      }
      return Promise.resolve();
    }
    this.playedNotesSinceReset = true;
    const onTime = this.queue.at(-1)?.endTime ?? now;
    const offTime = onTime + onDuration;
    const endTime = offTime + offDuration;
    let timeoutId: number | undefined;
    const promise = this.scheduler.schedule({
      start: (resolve) => {
        const duration = 1000 * (endTime - now);
        timeoutId = setTimeout(() => {
          note.done = true;
          resolve();
        }, duration);
      },
      cancel: () => {
        clearTimeout(timeoutId);
        note.done = true;
      }
    });
    const note = {frequency, onTime, offTime, endTime, promise, done: false};
    this.queue.push(note);
    if (this.enabled && frequency !== 0) {
      this.oscillator.frequency.setValueAtTime(frequency, onTime);
      this.gainNode.gain.setValueAtTime(1, onTime);
      this.gainNode.gain.setValueAtTime(0, offTime);
    }
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

  playSample(data: Uint8Array, sampleRate: number) {
    if (this.bufferSource) {
      this.bufferSource.disconnect();
    }
    this.bufferSource = this.audioContext.createBufferSource();
    this.bufferSource.connect(this.audioContext.destination);
    const audioBuffer = this.audioContext.createBuffer(1, data.byteLength, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < Math.min(audioBuffer.length, data.byteLength); i++) {
      channelData[i] = (data[i] - 128) / 128;
    }
    this.bufferSource.buffer = audioBuffer;
    this.bufferSource.start();
  }

  writeSynthesizerData(address: number, data: number) {
    this.synthesizer.writeRegister(this.audioContext.currentTime, address, data);
  }

  readSynthesizerStatus(): number {
    return this.synthesizer.readStatus();
  }

  loadMidi(data: Uint8Array) {
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'audio/midi' });
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataURI = e.target?.result;
      if (dataURI) {
        this.midiPlayer.src = dataURI as string;
      }
    }
    this.midiStillLoading = true;
    this.midiPlayer.addEventListener('load', (e) => {
      this.midiStillLoading = false;
      this.pendingPlayMidi?.();
    });
    reader.readAsDataURL(blob);
  }

  playMidi({restart, loop}: {restart: boolean, loop?: boolean}) {
    this.pendingPlayMidi = undefined;
    if (this.midiStillLoading) {
      this.pendingPlayMidi = () => {
        this.playMidi({restart: false, loop});
      };
      return;
    }
    if (restart) {
      this.midiPlayer.reload();
    }
    this.midiPlayer.loop = !!loop;
    if (this.enabled) {
      this.midiPlayer.start();
    }
  }

  stopMidi() {
    this.pendingPlayMidi = undefined;
    this.midiPlayer.stop();
  }

  playingMidi(): boolean {
    return this.midiPlayer.playing;
  }

  setScheduler(scheduler: Scheduler) {
    this.scheduler = scheduler;
  }
}