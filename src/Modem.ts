import { asciiToString, charToAscii, stringToAscii, CR, LF, trim } from "./AsciiChart.ts";
import { BAD_FILE_MODE, BAD_FILE_NAME, FIELD_OVERFLOW, FILE_ALREADY_OPEN, INPUT_PAST_END_OF_FILE, IOError } from "./Errors.ts";
import { FileAccessor, Handle, isSequentialWriteMode, Opener, OpenMode } from "./Files.ts";
import { BasePrinter } from "./Printer.ts";

export interface Modem extends Opener {
  reset(): void;
  checkForNewInput(): boolean;
  testGenerateInput?(): void;
}

interface Fetcher {
  fetch(url: string): Promise<Response>;
}

export class HttpFetcher implements Fetcher {
  async fetch(url: string): Promise<Response> {
    return fetch(url);
  }
}

export class TestFetcher implements Fetcher {
  constructor(private content: Map<string, string>) {
  }

  async fetch(url: string): Promise<Response> {
    const body = this.content.get(url);
    if (!body) {
      return Response.error();
    }
    return new Response(body);
  }
}

const SUPPORTED_BAUD_RATES = [
  '75',
  '110',
  '150',
  '300',
  '600',
  '1200',
  '1800',
  '2400',
  '4800',
  '9600',
  '19200',
];

export class HttpModem implements Modem {
  accessor?: HttpModemAccessor;
  connected = false;
  echo = true;
  baudRate = 300;
  hasNewInput = false;

  constructor(
    private fetcher: Fetcher = new HttpFetcher(),
    private respondInstantly?: boolean) {
  }

  open(options: string, mode: OpenMode, recordLength?: number): Handle {
    if (this.accessor) {
      throw new IOError(FILE_ALREADY_OPEN);
    }
    if (mode === OpenMode.BINARY) {
      throw new IOError(BAD_FILE_MODE);
    }
    // options is a comma-delimited list of communication options like 1200,N,8,1,etc
    // The only option we simulate is baud rate, to create suitable delays.
    const [baudSpec, _] = options.toLowerCase().split(',');
    const baudIndex = SUPPORTED_BAUD_RATES.indexOf(baudSpec);
    if (baudIndex === -1) {
      throw new IOError(BAD_FILE_NAME);
    }
    this.baudRate = +SUPPORTED_BAUD_RATES[baudIndex];
    this.accessor = new HttpModemAccessor(mode, () => this.getCommand(), recordLength);
    return {
      owner: this,
      data: {},
      accessor: this.accessor,
      fields: [],
    };
  }

  close(handle: Handle) {
    this.reset();
  }

  reset(): void {
    this.hasNewInput = false;
    delete this.accessor;
  }

  checkForNewInput() {
    const hasNewInput = this.hasNewInput;
    this.hasNewInput = false;
    return hasNewInput;
  }

  testGenerateInput() {
    this.inputModemResponse("OK");
  }

  private getCommand() {
    if (!this.accessor) {
      return;
    }
    if (this.echo) {
      const lastChar = this.accessor.outputBuffer[this.accessor.outputBuffer.length - 1];
      this.accessor.inputBuffer.push(lastChar);
      this.hasNewInput = true;
    }
    const line = consumeFirstLine(this.accessor.outputBuffer);
    if (line.length == 0) {
      return;
    }
    if (line.toLowerCase().startsWith('atdt')) {
      const url = trim(line.slice(4));
      setTimeout(async () => this.printDataFromUrl(url), 0);
      return;
    }
    this.inputModemResponse("ERROR");
  }

  private async printDataFromUrl(url: string) {
    if (!this.accessor) {
      return;
    }
    this.connected = true;
    const response = await this.fetcher.fetch(url);
    if (!response.ok) {
      this.inputModemResponse("ERROR");
      this.hasNewInput = true;
      return;
    }
    this.inputModemResponse("CONNECT");
    const data = await response.bytes();
    if (this.respondInstantly) {
      this.inputBytes(Array.from(data));
    } else {
      // 8N1 = 10 bits per symbol
      const bytesPerMs = this.baudRate / 10000;
      let i = 0;
      let ts = performance.now();
      while (i < data.length) {
        const now = performance.now();
        const numBytesReady = Math.floor((now - ts) * bytesPerMs);
        if (numBytesReady > 0) {
          ts = performance.now();
          this.inputBytes(Array.from(data.slice(i, i + numBytesReady)));
          i += numBytesReady;
        }
        await sleep(10);
      }
    }
    this.inputModemResponse("NO CARRIER");
    this.connected = false;
  }

  private inputModemResponse(string: string) {
    this.inputBytes(stringToAscii(modemResponse(string)));
  }

  private inputBytes(data: number[]) {
    if (this.accessor) {
      this.accessor.inputBuffer.push(...data);
      this.hasNewInput = true;
    }
  }
}

class HttpModemAccessor extends BasePrinter implements FileAccessor {
  inputBuffer: number[];
  outputBuffer: number[];
  outputBufferCapacity: number;

  constructor(private mode: OpenMode, private onOutput: () => void, outputBufferCapacity?: number) {
    super(65535);  // No width set by default
    this.inputBuffer = [];
    this.outputBuffer = [];
    this.outputBufferCapacity = outputBufferCapacity ?? 128;
  }

  openMode(): OpenMode {
    return this.mode;
  }

  seek(pos: number) {
  }

  getRecordBuffer(): number[] {
    throw new IOError(BAD_FILE_MODE);
  }

  getRecord(recordNumber?: number) {
    throw new IOError(BAD_FILE_MODE);
  }

  putRecord(recordNumber?: number) {
    throw new IOError(BAD_FILE_MODE);
  }

  getBytes(numBytes: number, position?: number): number[] {
    throw new IOError(BAD_FILE_MODE);
  }

  putBytes(bytes: number[], position?: number) {
    throw new IOError(BAD_FILE_MODE);
  }

  putChar(ch: string) {
    if (!isSequentialWriteMode(this.openMode())) {
      throw new IOError(BAD_FILE_MODE);
    }
    const value = charToAscii.get(ch);
    if (value === undefined) {
      throw new Error("unmapped character");
    }
    this.outputBuffer.push(value);
    this.onOutput();
  }

  readChars(numBytes: number): string {
    if (this.mode === OpenMode.OUTPUT || this.mode === OpenMode.APPEND) {
      throw new IOError(BAD_FILE_MODE);
    }
    if (numBytes > this.inputBuffer.length) {
      throw new IOError(INPUT_PAST_END_OF_FILE);
    }
    const data = this.inputBuffer.splice(0, numBytes);
    return asciiToString(data);
  }

  readLine(): string {
    if (this.mode === OpenMode.RANDOM) {
      throw new IOError(FIELD_OVERFLOW);
    }
    if (this.mode !== OpenMode.INPUT) {
      throw new IOError(BAD_FILE_MODE);
    }
    if (this.eof()) {
      throw new IOError(INPUT_PAST_END_OF_FILE);
    }
    return consumeFirstLine(this.inputBuffer);
  }

  length(): number {
    return Math.max(0, this.outputBufferCapacity - this.outputBuffer.length);
  }

  eof(): boolean {
    return this.inputBuffer.length === 0;
  }

  getSeek(): number {
    return 0;
  }

  getLoc(): number {
    return this.inputBuffer.length;
  }
}

function consumeFirstLine(buffer: number[]): string {
  for (let n = 0; n < buffer.length; n++) {
    if (buffer[n] === 13) {
      if (buffer[n + 1] === 10) {
        return asciiToString(buffer.splice(0, n + 2));
      }
      return asciiToString(buffer.splice(0, n + 1));
    }
    // Accept unix newlines for convenience.
    if (buffer[n] === 10) {
      return asciiToString(buffer.splice(0, n + 1));
    }
  }
  return "";
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function modemResponse(str: string): string {
  return `${CR + LF + CR + LF}${str}${CR + LF}`;
}