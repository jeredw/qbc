import { Devices } from "./Devices.ts";
import { Program } from "./Programs.ts";
import { Memory } from "./Memory.ts";
import { ControlFlowTag } from "./ControlFlow.ts";
import { RuntimeError, RETURN_WITHOUT_GOSUB, ErrorHandling, RESUME_WITHOUT_ERROR, NO_RESUME } from "./Errors.ts";
import { ReturnStatement } from "./statements/Return.ts";
import { ProgramData } from "./ProgramData.ts";
import { Files } from "./Files.ts";
import { Events } from "./Events.ts";
import { RandomNumbers } from "./RandomNumbers.ts";
import { ResumeStatement } from "./statements/Errors.ts";

export function invoke(devices: Devices, memory: Memory, program: Program) {
  return new Invocation(devices, memory, program);
}

interface ProgramLocation {
  chunkIndex: number;
  statementIndex: number;
  lineNumber?: number;
  pusher?: ControlFlowTag;
  reenableEvents?: () => void;
}

// Programs run on the ui thread, but setTimeout at least every N ms for events.
// In modern browsers, this amounts to simple bang-bang 1ms on / 4ms off.
// Each statement is its own microtask and may yield separately.
// TODO: Investigate using web workers instead.
const RELEASE_UI_THREAD_MS = 10;

export class Invocation {
  private devices: Devices;
  private memory: Memory;
  private data: ProgramData;
  private program: Program;
  private files: Files;
  private events: Events;
  private errorHandling: ErrorHandling;
  private random: RandomNumbers;
  private stack: ProgramLocation[]
  private stopped: boolean = true;
  private stepFromLine?: number;
  line: number = 0;

  constructor(devices: Devices, memory: Memory, program: Program) {
    this.devices = devices;
    this.memory = memory;
    this.data = new ProgramData(program.data);
    this.files = new Files();
    this.events = new Events(devices);
    this.random = new RandomNumbers();
    this.errorHandling = {};
    this.program = program;
  }

  stop() {
    this.stopped = true;
  }

  async start(): Promise<void> {
    this.stopped = false;
    let lastYield = 0;
    const nextStep = async (resolve: Function, reject: Function) => {
      try {
        await this.step();
        if (!this.isStopped()) {
          if (performance.now() - lastYield > RELEASE_UI_THREAD_MS) {
            setTimeout(() => {
              lastYield = performance.now();
              nextStep(resolve, reject)
            }, 0);
          } else {
            await nextStep(resolve, reject);
          }
        } else {
          resolve();
        }
      } catch (error: unknown) {
        reject(error);
      }
    }
    return new Promise((resolve, reject) => {
      nextStep(resolve, reject);
    });
  }

  async restart(): Promise<void> {
    const chunks = this.program.chunks;
    this.stack = [];
    this.data.restore(0);
    this.files = new Files();
    if (chunks.length > 0 && chunks[0].statements.length > 0) {
      this.stack.push({chunkIndex: 0, statementIndex: 0});
    }
    return this.start();
  }

  isAtEnd() {
    return this.stack.length == 0;
  }

  isStopped() {
    return this.stopped ||
      this.stack.length == 0 ||
      (this.stepFromLine !== undefined && this.line !== this.stepFromLine);
  }

  tick() {
  }

  async stepOneLine() {
    if (this.line === undefined) {
      return;
    }
    this.stepFromLine = this.line;
    await this.start();
    this.stepFromLine = undefined;
    this.stopped = true;
  }

  async step() {
    if (this.isStopped()) {
      return;
    }
    const {chunkIndex, statementIndex} = this.stack[this.stack.length - 1]!;
    const chunk = this.program.chunks[chunkIndex];
    if (!chunk) {
      throw new Error(`invalid chunk ${chunkIndex}`);
    }
    if (statementIndex >= chunk.statements.length) {
      if (this.errorHandling.active) {
        throw RuntimeError.fromToken(this.errorHandling.token!, NO_RESUME);
      }
      this.exitChunk();
      this.step();
      return;
    }
    const statement = chunk.statements[statementIndex];
    if (statement.startToken) {
      this.line = statement.startToken.line;
    }
    if (!this.errorHandling.active) {
      if (statement.lineNumber !== undefined) {
        // Keep track of the most recent line number executed for ERL.
        this.errorHandling.lineNumber = statement.lineNumber;
      }
      // TODO: check for program statement boundaries
      const eventTrap = this.events.poll();
      if (eventTrap) {
        this.stack.push({
          chunkIndex: 0,
          statementIndex: eventTrap.targetIndex,
          pusher: ControlFlowTag.GOSUB,
          reenableEvents: eventTrap.reenableEvents
        });
        return;
      }
      // TODO: move sleep polling to rAF().
      if (this.events.sleeping()) {
        return;
      }
    }
    try {
      const controlFlow = statement.execute({
        devices: this.devices,
        memory: this.memory,
        data: this.data,
        files: this.files,
        events: this.events,
        errorHandling: this.errorHandling,
        random: this.random,
      });
      this.stack[this.stack.length - 1].statementIndex++;
      if (!controlFlow) {
        return;
      }
      switch (controlFlow.tag) {
        case ControlFlowTag.GOTO:
          if (statement.targetIndex === undefined) {
            throw new Error("missing target for GOTO")
          }
          this.stack[this.stack.length - 1].statementIndex = statement.targetIndex;
          break;
        case ControlFlowTag.GOSUB:
          if (statement.targetIndex === undefined) {
            throw new Error("missing target for GOSUB")
          }
          this.stack.push({
            chunkIndex,
            statementIndex: statement.targetIndex,
            pusher: ControlFlowTag.GOSUB
          });
          break;
        case ControlFlowTag.CALL:
          this.stack.push({
            chunkIndex: controlFlow.chunkIndex,
            statementIndex: 0,
            pusher: ControlFlowTag.CALL,
          });
          break;
        case ControlFlowTag.RETURN:
          if (controlFlow.where == ControlFlowTag.GOSUB) {
            if (this.stack[this.stack.length - 1].pusher != ControlFlowTag.GOSUB) {
              const returnStatement = statement as ReturnStatement;
              // We already incremented past the RETURN statement above, but
              // RESUME expects the index to point at the error statement.
              this.stack[this.stack.length - 1].statementIndex--;
              throw RuntimeError.fromToken(returnStatement.start!, RETURN_WITHOUT_GOSUB);
            }
            this.stack[this.stack.length - 1].reenableEvents?.();
            this.stack.pop();
            if (statement.targetIndex !== undefined) {
              // For RETURN to a specific label.
              this.stack[this.stack.length - 1].statementIndex = statement.targetIndex;
            }
          } else if (controlFlow.where == ControlFlowTag.CALL) {
            this.exitChunk();
          }
          break;
        case ControlFlowTag.RESUME:
          if (!this.errorHandling.active) {
            const resumeStatement = statement as ResumeStatement;
            throw RuntimeError.fromToken(resumeStatement.token, RESUME_WITHOUT_ERROR);
          }
          const top = this.stack[this.stack.length - 1];
          if (controlFlow.targetIndex !== undefined) {
            top.chunkIndex = 0;
            top.statementIndex = controlFlow.targetIndex;
          } else {
            top.chunkIndex = this.errorHandling.chunkIndex!;
            top.statementIndex = this.errorHandling.statementIndex!;
          }
          if (controlFlow.next) {
            top.statementIndex++;
          }
          this.errorHandling.active = false;
          break;
        case ControlFlowTag.HALT:
          this.stack = [];
          break;
        case ControlFlowTag.WAIT:
          await controlFlow.promise;
          break;
      }
    } catch (e: unknown) {
      if (e instanceof RuntimeError) {
        if (!this.errorHandling.active && this.errorHandling.targetIndex !== undefined) {
          this.errorHandling.active = true;
          this.errorHandling.error = e.error;
          this.errorHandling.errorLine = this.errorHandling.lineNumber;
          const top = this.stack[this.stack.length - 1];
          this.errorHandling.chunkIndex = top.chunkIndex;
          this.errorHandling.statementIndex = top.statementIndex;
          top.chunkIndex = 0;
          top.statementIndex = this.errorHandling.targetIndex;
          return;
        }
      }
      throw e;
    }
  }

  private exitChunk() {
    this.discardGosubFrames();
    const callFrame = this.stack[this.stack.length - 1];
    if (callFrame.pusher == ControlFlowTag.CALL) {
      this.memory.popStack();
    }
    this.stack.pop();
  }

  private discardGosubFrames() {
    while (this.stack.length && this.stack[this.stack.length - 1].pusher == ControlFlowTag.GOSUB) {
      this.stack.pop();
    }
  }
}