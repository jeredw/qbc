// Software OPL2 based on a1kon's excellent little emulator
// https://github.com/a1k0n/opl2/blob/master/opl2.js
// Some more hardware notes here
// https://cosmodoc.org/topics/adlib-functions/

const BUFFER_SIZE = 4096;

// The OPL2 synthesizer does not have any kind of multiplier; it multiplies
// by adding in log space, and then exponentiating using this 2^0 .. 2^1
// lookup table.
const EXP = (() => {
  const exp = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    // This is slightly different from what's stored in the actual ROM on the
    // chip in that the chip only stores bits 0..9 (bit 10 is always 1),
    // but it makes our own computations simpler.
    exp[i] = 2 * Math.pow(2, 1 - i / 256.0) * 1024 + 0.5;
  }
  return exp;
})();

// sine waves are stored in log format, in this table. On a real chip only a
// quarter wave is stored in ROM, but to simplify the code we store a half
// wave here at the cost of 256 more words of "ROM" (I think we can afford
// that...)
const LOG_SIN = (() => {
  const logSin = new Uint16Array(512);
  for (let i = 0; i < 512; i++) {
    logSin[i] = -Math.log(Math.sin((i + 0.5) * Math.PI / 512)) / Math.log(2) * 256 + 0.5;
  }
  return logSin;
})();

// guessing the YM3812 doesn't have any sort of multiplier, just shift/add/sub
// with two taps, so these are the closest values you get when multiplying
// carrier frequencies
const FREQ_MUL = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 12, 12, 15, 15];

// Attack phase to volume table.
const ATTACK = (() => {
  const attack: number[] = [];
  let x = 512;
  for (let i = 0; i < 36; i++) {
    attack.push(8 * x);
    x -= (x >> 3) + 1;
  }
  return attack;
})();

class Operator {
  waveform = 0;
  phase = 0;  // phase, float, [0..1024)
  phaseIncr = 0;  // phase increment per sample
  feedback = 0;
  lastSample1 = 0;
  lastSample0 = 0;

  // Generate output wave into out, attenuated per-sample by volume (in "log
  // volume" -- higher is quieter).
  //
  // This is specialized to the carrier wave, as it takes modulation as input and
  // has no feedback.
  //
  // It also adds to its output, rather than setting it directly, for summing up
  // the final waveform.
  genCarrierWave(volume: Int32Array, modulation: Int32Array, numSamples: number, out: Int32Array) {
    if (volume.length < numSamples) {
      throw new Error("genCarrierWave: volume buffer too short " + volume.length + " / " + numSamples);
    }
    if (modulation.length < numSamples) {
      throw new Error("genCarrierWave: modulation buffer too short " + modulation.length + " / " + numSamples);
    }
    if (out.length < numSamples) {
      throw new Error("genCarrierWave: output buffer too short " + out.length + " / " + numSamples);
    }

    let p = this.phase;
    const dp = this.phaseIncr;

    // Specialized versions of each waveform here, as this is the inner loop of
    // the player and it should be as tight as possible!
    // TODO: change ifs to integer masks where possible

    if (this.waveform == 0) {  // sine wave: ^v^v
      for (let i = 0; i < numSamples; i++) {
        const m = p + modulation[i];  // m = modulated phase
        const l = LOG_SIN[m & 511] + volume[i];  // l = -log(sin(p)) - log(volume)
        let w = 0;
        if (l <= 7935) { // we need to special-case this because x >> 32 === x >> 0 in javascript
          w = EXP[l & 0xff] >> (l >> 8);  // table-based exponentiation: w = 4096 * 2^(-l/256)
        }
        if (m & 512) {
          w = -w;  // negative part of sin wave
        }
        p += dp;  // phase increment
        out[i] += w;
      }
    } else if (this.waveform == 1) {  // chopped sine wave: ^-^-
      for (let i = 0; i < numSamples; i++) {
        const m = p + modulation[i];
        let w = 0;
        if (m & 512) {
          let l = LOG_SIN[m & 511] + volume[i];
          if (l <= 7935) {
            w = EXP[l & 0xff] >> (l >> 8);
          }
        }
        p += dp;
        out[i] += w;
      }
    } else if (this.waveform == 2) {  // abs sine wave: ^^^^
      for (let i = 0; i < numSamples; i++) {
        const m = p + modulation[i];
        const l = LOG_SIN[m & 511] + volume[i];
        let w = 0;
        if (l <= 7935) {
          w = EXP[l & 0xff] >> (l >> 8);
        }
        p += dp;
        out[i] += w;
      }
    } else if (this.waveform == 3) {  // chopped half sine wave: ////
      for (let i = 0; i < numSamples; i++) {
        const m = p + modulation[i];
        let w = 0;
        if (m & 256) {
          let l = LOG_SIN[m & 255] + volume[i];
          if (l <= 7935) {
            w = EXP[l & 0xff] >> (l >> 8);
          }
        }
        p += dp;
        out[i] += w;
      }
    }

    this.phase = p % 1024.0;
  }

  // Generate modulator wave into out, attenuated per-sample by volume (in "log
  // volume" -- higher is quieter).
  //
  // This is specialized to the modulator wave, as it implements feedback
  // (self-modulation).
  genModulatorWave(volume: Int32Array, numSamples: number, out: Int32Array) {
    if (volume.length < numSamples) {
      throw new Error("genModulatorWave: volume buffer too short " + volume.length + " / " + numSamples);
    }
    if (out.length < numSamples) {
      throw new Error("genModulatorWave: output buffer too short " + out.length + " / " + numSamples);
    }

    let p = this.phase;
    const dp = this.phaseIncr;
    let w1 = this.lastSample1;
    let w = this.lastSample0;  // w = last waveform output sample
    let feedbackShift = 31;  // shift feedback down 31 bits (to 0)...
    if (this.feedback > 0) {  // ...unless we have a feedback set
      feedbackShift = 9 - this.feedback;
    }

    // Specialized versions of each waveform here, as this is the inner loop of
    // the player and it should be as tight as possible!
    // TODO: change ifs to integer masks where possible

    if (this.waveform == 0) {  // sine wave: ^v^v
      for (let i = 0; i < numSamples; i++) {
        const m = p + ((w + w1) >> feedbackShift);  // m = modulated phase
        w1 = w;
        const l = LOG_SIN[m & 511] + volume[i];  // l = -log(sin(p)) - log(volume)
        if (l >= 7936) {  // special case because x >> 32 === x >> 0
          w = 0;  // we want x >> (31 or more) === 0
        } else {
          w = EXP[l & 0xff] >> (l >> 8);  // table-based exponentiation: w = 4096 * 2^(-l/256)
        }
        if (m & 512) {
          w = -w;  // negative part of sin wave
        }
        p += dp;  // phase increment
        out[i] = w;
      }
    } else if (this.waveform == 1) {  // chopped sine wave: ^-^-
      for (let i = 0; i < numSamples; i++) {
        let m = p + ((w + w1) >> feedbackShift);
        w1 = w;
        if (m & 512) {
          let l = LOG_SIN[m & 511] + volume[i];
          if (l >= 7936) {
            w = 0;
          } else {
            w = EXP[l & 0xff] >> (l >> 8);
          }
        } else {
          w = 0;
        }
        p += dp;
        out[i] = w;
      }
    } else if (this.waveform == 2) {  // abs sine wave: ^^^^
      for (let i = 0; i < numSamples; i++) {
        const m = p + ((w + w1) >> feedbackShift);
        w1 = w;
        const l = LOG_SIN[m & 511] + volume[i];
        if (l >= 7936) {
          w = 0;
        } else {
          w = EXP[l & 0xff] >> (l >> 8);
        }
        p += dp;
        out[i] = w;
      }
    } else if (this.waveform == 3) {  // chopped half sine wave: ////
      for (let i = 0; i < numSamples; i++) {
        const m = p + ((w + w1) >> feedbackShift);
        w1 = w;
        if (m & 256) {
          const l = LOG_SIN[m & 255] + volume[i];
          if (l >= 7936) {
            w = 0;
          } else {
            w = EXP[l & 0xff] >> (l >> 8);
          }
        } else {
          w = 0;
        }
        p += dp;
        out[i] = w;
      }
    }

    this.phase = p % 1024.0;
    this.lastSample1 = w1;
    this.lastSample0 = w;
  }
}

// Generate ADSR (attack, decay, sustain, release) envelopes
class Envelope {
  attackPhase = 0;  // phase within the particular mode
  adsrMode = 0;  // current mode: 0: attack, 1: decay, 2: sustain, 3: release
  attackInc = 0;
  decayInc = 0;
  sustainLevel = 0;
  releaseInc = 0;
  keyed = true;
  volume = 4095;

  // Sustain note until released (if false, immediately release even with
  // keyOn)
  sustainMode = true;

  // Set OPL2 ADSR registers (each 0..15)
  // N.B.: needs adjustment for output sampling frequency
  // we also need to look at key scaling rate for the channel

  set attack(attack: number) {
    // So on a real YM3812, with attack set at 4, the volume changes every 512 samples
    // according to a schedule:
    //   v[0] = 4096
    //   v[i] = v[0] - (v[0]>>3) - 1
    // since each volume level has a period of 512 samples at rate 4,
    // rate 0 would have a period of 512 << 4 or 8192
    // So we have a 13-bit counter
    this.attackInc = 1 << attack;  // TODO: Adjust for relative sampling frequency
  }

  // Decay and release seem to use these linear rates
  set decay(decay: number) {
    this.decayInc = (1 << decay) / 768.0;  // ???
  }

  set release(release: number) {
    this.releaseInc = (1 << release) / 768.0;
  }

  set sustain(sustain: number) {
    this.sustainLevel = sustain << 7;  // This must be scaled by some factor. *shrug*
  }

  keyOn() {
    this.attackPhase = 0;
    this.adsrMode = 0;
    this.keyed = true;
  }

  keyOff() {
    this.keyed = false;
  }

  generate(level: number, numSamples: number, out: Int32Array) {
    // this is just a guess for now, just to get some sounds
    const sustainLevel = this.sustainLevel;
    let volume = this.volume;
    let offset = 0;
    while (offset < numSamples) {
      if (this.adsrMode == 0) {  // attack
        while (offset < numSamples && this.attackPhase < 8192 * 36) {
          volume = ATTACK[this.attackPhase >> 13];
          this.attackPhase += this.attackInc;
          out[offset++] = volume + level;
        }
        if (this.attackPhase >= 8192 * 36) {
          this.adsrMode++;
          volume = 0;
        }
      } else if (this.adsrMode == 1) {  // decay
        while (offset < numSamples) {
          out[offset++] = volume + level;
          volume += this.decayInc;
          if (volume >= sustainLevel) {
            volume = sustainLevel;
            this.adsrMode++;
            break;
          }
        }
      } else if (this.adsrMode == 2) {  // sustain
        if (!this.keyed || !this.sustainMode) {  // release note?
          this.adsrMode++;
          continue;
        }
        while (offset < numSamples) {
          out[offset++] = sustainLevel + level;
        }
      } else if (this.adsrMode == 3) {  // release
        while (offset < numSamples) {
          out[offset++] = volume + level;
          volume += this.releaseInc;
          if (volume > 4095) {
            volume = 4095;
          }
        }
      } else {
        throw new Error("invalid adsrMode " + this.adsrMode);
      }
    }
    this.volume = volume;
  }
}

class Channel {
  carrier = new Operator();
  carrierEnvelope = new Envelope();
  carrierMul = 1;
  modulator = new Operator();
  modulatorEnvelope = new Envelope();
  modulatorMul = 1;
  carrierLevel = 0;
  modulatorLevel = 0;
  level = 0;
  globalLevel = 0;
  connection = 0;
  frequency = 0;

  constructor(public num: number, globalLevel: number) {
    this.num = num;
    this.globalLevel = globalLevel << 5;
  }

  set frequencyHighBitsAndOctave(data: number) {
    this.frequency = ((data & 0x1f) << 8) | (this.frequency & 0xff);
    this.updateFrequency();
  }

  set frequencyLowBits(data: number) {
    this.frequency = (this.frequency & 0x1f00) | (data & 0xff);
    this.updateFrequency();
  }

  private updateFrequency() {
    // Adjust increments for local playback sampling rate
    // Original chip sample clock is 14.31818MHz divided down by 288
    const fScale = 14313180.0 / (288 * Synthesizer.SampleRate);
    const octave = (this.frequency >> 10) & 7;
    const incr = ((this.frequency & 0x3ff) << octave) / 1024.0;
    this.carrier.phaseIncr = incr * this.carrierMul * fScale;
    this.modulator.phaseIncr = incr * this.modulatorMul * fScale;
  }

  keyOn() {
    this.carrierEnvelope.keyOn();
    this.modulatorEnvelope.keyOn();
  }

  keyOff() {
    this.carrierEnvelope.keyOff();
    this.modulatorEnvelope.keyOff();
  }

  setLevel(level: number) {
    this.level = level << 5;
  }

  // generation requires two scratch buffers at least as big as numSamples
  generate(numSamples: number, out: Int32Array, scratch1: Int32Array, scratch2: Int32Array) {
    // FIXME: if connection == 1, then just add modulator and carrier
    //   and don't forget to add level to mlevel

    // modulator volume envelope into scratch1
    this.modulatorEnvelope.generate(this.modulatorLevel, numSamples, scratch1);
    // modulator output into scratch1
    this.modulator.genModulatorWave(scratch1, numSamples, scratch1);
    // carrier envelope into scratch2
    this.carrierEnvelope.generate(this.carrierLevel + this.level + this.globalLevel, numSamples, scratch2);
    // and final output into out
    this.carrier.genCarrierWave(scratch2, scratch1, numSamples, out);
  }
}

// Decoding OPL2 register addresses
// channel   0  1  2 | 3  4  5 | 6  7  8
// modulator 0  1  2 | 8  9  a | 10 11 12
// carrier   3  4  5 | b  c  d | 13 14 15
const OPERATOR_INDEX_TO_CHANNEL_INDEX = [
   0,  1,  2,  0,  1,  2, -1, -1,
   3,  4,  5,  3,  4,  5, -1, -1,
   6,  7,  8,  6,  7,  8, -1, -1,
  -1, -1, -1, -1, -1, -1, -1, -1
];

interface SequencerStep {
  time: number;
  channelIndex: number;
  frequencyLowBits?: number;
  frequencyHighBitsAndOctave?: number;
  keyOn?: boolean;
  keyOff?: boolean;
}

class Opl2Timer {
  mask = false;
  enabled = false;
  triggered = false;
  preset = 0;
  count = 0;
  elapsedTime = 0;

  constructor(private readonly period: number) {
  }

  tick(dt: number) {
    if (!this.enabled) {
      return false;
    }
    // TODO: Rewrite this not to loop 1000 times per callback if it matters...
    this.elapsedTime += dt;
    while (this.elapsedTime > this.period) {
      this.count++;
      if (this.count > 255) {
        this.triggered = true;
        this.count = this.preset;
      }
      this.elapsedTime -= this.period;
    }
  }
}

export class Synthesizer {
  static SampleRate = 0;
  soundActive = false;
  scratch1 = new Int32Array(BUFFER_SIZE);
  scratch2 = new Int32Array(BUFFER_SIZE);
  outbuf = new Int32Array(BUFFER_SIZE);
  channels: Channel[] = [];
  sequence: SequencerStep[] = [];
  timer1 = new Opl2Timer(80e-6);
  timer2 = new Opl2Timer(320e-6);
  irq = false;
  gainNode?: GainNode;
  jsNode?: ScriptProcessorNode;

  constructor() {
    for (let i = 0; i < 9; i++) {
      this.channels[i] = new Channel(i, 0);
    }
  }

  writeRegister(time: number, address: number, data: number) {
    // Avoid running the audio processor unless the program accesses an adlib register.
    this.soundActive = true;
    // Key on/off and frequency changes are timed with audio generation.
    // Other parameter changes happen immediately for simplicity.
    if (address === 0x2) {
      this.timer1.preset = data;
      return;
    }
    if (address === 0x3) {
      this.timer2.preset = data;
      return;
    }
    if (address === 0x4) {
      if (data & 0x80) {
        this.irq = false;
        this.timer1.triggered = false;
        this.timer2.triggered = false;
      }
      this.timer2.mask = !!(data & 0x40);
      this.timer1.mask = !!(data & 0x20);
      this.timer2.enabled = !!(data & 2);
      this.timer1.enabled = !!(data & 1);
      return;
    }
    const channelIndex = address & 0xf;
    const channel = this.channels[channelIndex];
    if (address >= 0xa0 && address <= 0xa8) {
      this.sequence.push({time, channelIndex, frequencyLowBits: data});
      return;
    }
    if (address >= 0xb0 && address <= 0xb8) {
      const keyOn = !!(data & 0x20);
      const keyOff = !keyOn;
      this.sequence.push({
        time,
        channelIndex,
        frequencyHighBitsAndOctave: data & 0x1f,
        keyOn,
        keyOff,
      });
      return;
    }
    if (address >= 0xc0 && address <= 0xc8) {
      channel.connection = data & 1;
      channel.modulator.feedback = (data >> 1) & 7;
      return;
    }
    // Assume address is an operator register.
    this.writeOperatorRegister(address, data);
  }

  private writeOperatorRegister(address: number, data: number) {
    const channelIndex = OPERATOR_INDEX_TO_CHANNEL_INDEX[address & 0x1f];
    if (channelIndex === -1) {
      // Invalid register writes can happen normally if the card is initialized
      // by writing 0s to 256 registers in a loop.
      return;
    }
    const channel = this.channels[channelIndex];
    const modulator = (address & 7) < 3;
    if (address >= 0x20 && address <= 0x20 + 0x15) {
      // TODO: tremolo data[3/8] & 0x80
      // TODO: vibrato data[3/8] & 0x40
      // TODO: KSR data[3/8] & 0x10
      const mul = FREQ_MUL[data & 0xf];
      const sustainMode = !!(data & 0x20);
      if (modulator) {
        channel.modulatorMul = mul;
        channel.modulatorEnvelope.sustainMode = sustainMode;
      } else {
        channel.carrierMul = mul;
        channel.carrierEnvelope.sustainMode = sustainMode;
      }
      return;
    }
    if (address >= 0x40 && address <= 0x40 + 0x15) {
      // TODO: KSL data[2/7] >> 6
      const level = (data & 0x3f) << 5;
      if (modulator) {
        channel.modulatorLevel = level;
      } else {
        channel.carrierLevel = level;
      }
      return;
    }
    if (address >= 0x60 && address <= 0x60 + 0x15) {
      const envelope = modulator ? channel.modulatorEnvelope : channel.carrierEnvelope;
      envelope.attack = (data >> 4) & 0xf;
      envelope.decay = data & 0xf;
      return;
    }
    if (address >= 0x80 && address <= 0x80 + 0x15) {
      const envelope = modulator ? channel.modulatorEnvelope : channel.carrierEnvelope;
      envelope.sustain = (data >> 4) & 0xf;
      envelope.release = data & 0xf;
      return;
    }
    if (address >= 0xe0 && address <= 0xe0 + 0x15) {
      const operator = modulator ? channel.modulator : channel.carrier;
      operator.waveform = data & 3;
      return;
    }
  }

  readStatus(): number {
    // Avoid running the audio processor unless the program accesses an adlib register.
    this.soundActive = true;
    // Some code to detect the presence of an AdLib card uses status register
    // reads to wait for timers to trigger.  Tick timers here since audio
    // callbacks won't be frequent enough for that to work.
    const inpTime = 500e-6;  // guess around 500 us
    this.timer1.tick(inpTime);
    this.timer2.tick(inpTime);
    this.updateIrq();
    return (this.irq ? 0x80 : 0) | (this.timer1.triggered ? 0x40 : 0) | (this.timer2.triggered ? 0x20 : 0);
  }

  connect(audioContext: AudioContext) {
    if (this.jsNode && this.gainNode) {
      this.jsNode.disconnect(this.gainNode);
    }
    Synthesizer.SampleRate = audioContext.sampleRate;
    this.gainNode = audioContext.createGain();
    this.gainNode.gain.value = 0.2;  // master volume
    // TODO: Consider actually using a worker for this, we have a lot going on here already.
    this.jsNode = audioContext.createScriptProcessor(BUFFER_SIZE, 0, 2);
    this.jsNode.onaudioprocess = (e: AudioProcessingEvent) => {
      if (!this.soundActive) {
        return;
      }
      const buflen = e.outputBuffer.length;
      const dataL = e.outputBuffer.getChannelData(0);
      const dataR = e.outputBuffer.getChannelData(1);
      this.generate(e.playbackTime, buflen, dataL, dataR);
    };
    this.jsNode.connect(this.gainNode);
    this.gainNode.connect(audioContext.destination);
  }

  disconnect() {
    if (this.gainNode) {
      this.gainNode.disconnect();
    }
    if (this.jsNode) {
      this.jsNode.disconnect();
    }
    this.gainNode = undefined;
    this.jsNode = undefined;
  }

  generate(time: number, bufLength: number, dataL: Float32Array, dataR: Float32Array) {
    let offset = 0;
    while (offset < bufLength) {
      const t = time + (offset / Synthesizer.SampleRate);
      while (this.sequence.length && this.sequence[0].time <= t) {
        const step = this.sequence.shift()!;
        const channel = this.channels[step.channelIndex];
        if (step.frequencyLowBits !== undefined) {
          channel.frequencyLowBits = step.frequencyLowBits;
        }
        if (step.frequencyHighBitsAndOctave !== undefined) {
          channel.frequencyHighBitsAndOctave = step.frequencyHighBitsAndOctave;
        }
        if (step.keyOn) {
          channel.keyOn();
        } else if (step.keyOff) {
          channel.keyOff();
        }
      }
      const samplesTilNextStep = this.sequence.length ?
         Math.ceil((this.sequence[0].time - t) / Synthesizer.SampleRate) :
         Infinity;
      const numSamples = Math.min(samplesTilNextStep, bufLength - offset);

      for (let j = 0; j < 9; j++) {
        this.channels[j].generate(numSamples, this.outbuf, this.scratch1, this.scratch2);
      }

      for (let i = 0; i < numSamples; i++) {
        dataL[offset + i] = this.outbuf[i] * (1.0 / 4096.0);
        dataR[offset + i] = dataL[offset + i];  // TODO: add a spatialization filter
        this.outbuf[i] = 0;
      }

      offset += numSamples;
    }
    this.timer1.tick(bufLength / Synthesizer.SampleRate);
    this.timer2.tick(bufLength / Synthesizer.SampleRate);
    this.updateIrq();
  }

  private updateIrq() {
    if (this.timer1.mask && this.timer1.triggered || this.timer2.mask && this.timer2.triggered) {
      this.irq = true;
    }
  }
}