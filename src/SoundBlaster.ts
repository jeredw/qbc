import { Speaker } from "./Speaker.ts";

export class SoundBlaster {
  private addressByteIndex = 0;
  private address = [0, 0, 0];
  private lengthByteIndex = 0;
  private length = [0, 0];
  private pendingAudioData?: Uint8Array;
  private dspOut: number[] = [];
  private dspIn: number[] = [];
  private timeConstant = 0;
  private playDone = false;
  private oplAddress = 0;

  constructor(private speaker: Speaker) {
  }

  usesPort(port: number): boolean {
    if (port === 0x2 || port === 0x83 || port === 0x3 || port === 0x8 || port === 0xa) {
      // 8237 DMA channel 1
      return true;
    }
    if (port >= 0x220 && port <= 0x22f) {
      // Sound Blaster DSP, FM synth, and mixer
      return true;
    }
    if (port === 0x388 || port === 0x389) {
      // FM synth
      return true;
    }
    return false;
  }

  input(port: number): number {
    switch (port) {
      // Return DMA length and status values that suggest the transfer is done
      // when it is done, otherwise 0.
      case 0x3:
        return this.playDone ? 255 : 0;
      case 0x8:
        return this.playDone ? 8 : 0;
      case 0x22a: {
        const outData = this.dspOut.shift() ?? 0;
        return outData;
      }
      case 0x22e:
        return this.dspOut.length > 0 ? 0x80 : 0;
      // @ts-ignore
      case 0x228:
      // fallthrough
      case 0x388:
        return this.speaker.readSynthesizerStatus();
    }
    return 0;
  }

  output(port: number, data: number): number | void {
    switch (port) {
      case 0x2:
        // DMA address: reads low byte then high byte of address
        this.playDone = false;
        this.address[this.addressByteIndex] = data;
        this.addressByteIndex = 1 - this.addressByteIndex;
        break;
      case 0x83:
        // DMA page: reads even more bytes of address
        this.address[2] = data;
        break;
      case 0x3:
        // DMA length: reads low byte then high byte of length
        this.length[this.lengthByteIndex] = data;
        this.lengthByteIndex = 1 - this.lengthByteIndex;
        break;
      case 0xa:
        // DMA transfer: initiates transfer
        if (data === 1) {
          this.lengthByteIndex = 0;
          this.addressByteIndex = 0;
          // Caller will sendData() from this address
          return (this.address[2] << 16) | (this.address[1] << 8) | this.address[0];
        }
        break;
      case 0x226:
        // DSP reset
        this.dspOut = [0xaa];
        break;
      case 0x22c:
        // DSP data register
        this.dspWrite(data);
        break;
      // @ts-ignore
      case 0x228:
        // fallthrough
      case 0x388:
        this.oplAddress = data;
        break;
      // @ts-ignore
      case 0x229:
        // fallthrough
      case 0x389:
        this.speaker.writeSynthesizerData(this.oplAddress, data);
        break;
    }
  }

  private dspWrite(data: number) {
    if (!this.dspIn[0]) {
      this.dspIn = [data];
    } else {
      this.dspIn.push(data);
    }
    const command = this.dspIn[0];
    switch (command) {
      case 0x10:
        // Write DAC (one sample byte)
        if (this.dspIn.length === 2) {
          this.dspIn = [];
        }
        break;
      case 0x14:
        // 8-bit pcm output (two length bytes)
        if (this.dspIn.length === 3) {
          this.play();
          this.dspIn = [];
        }
        break;
      case 0x20:
        // Read DAC. Just return a dummy value
        this.dspOut = [0];
        this.dspIn = [];
        break;
      case 0x40:
        // Write time constant (one argument byte)
        if (this.dspIn.length === 2) {
          this.timeConstant = this.dspIn[1];
          this.dspIn = [];
        }
        break;
      case 0x48:
        // Set block transfer size (2 byte length)
        if (this.dspIn.length === 3) {
          this.dspIn = [];
        }
        break;
      case 0x91:
        // 8-bit PCM "high speed" output
        this.play();
        this.dspIn = [];
        break;
      case 0xe1:
        // Read DSP version
        this.dspOut = [0x3, 0x0];
        this.dspIn = [];
        break;
      default:
        this.dspIn = [];
        break;
    }
  }

  sendData(data: Uint8Array) {
    this.pendingAudioData = data;
  }

  private play() {
    this.playDone = false;
    if (this.pendingAudioData) {
      const sampleRate = 1000000 / (256 - this.timeConstant);
      const length = (this.length[1] << 8) + this.length[0];
      const trimmedData = this.pendingAudioData.slice(0, length);
      this.speaker.playSample(trimmedData, sampleRate);
      setTimeout(
        () => this.playDone = true,
        1000 * (length / sampleRate)
      );
    }
    this.pendingAudioData = undefined;
  }
}