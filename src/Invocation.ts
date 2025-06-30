import { Devices } from "./Devices.ts";
import { DebugInfo, Program } from "./Programs.ts";
import { Memory } from "./Memory.ts";
import { ControlFlowTag } from "./ControlFlow.ts";
import { RuntimeError, RETURN_WITHOUT_GOSUB, ErrorHandling, RESUME_WITHOUT_ERROR, NO_RESUME, ILLEGAL_FUNCTION_CALL } from "./Errors.ts";
import { ReturnStatement } from "./statements/Return.ts";
import { ProgramData } from "./ProgramData.ts";
import { Files } from "./Files.ts";
import { Events } from "./Events.ts";
import { RandomNumbers } from "./RandomNumbers.ts";
import { ResumeStatement } from "./statements/Errors.ts";
import { DebugState } from "./DebugState.ts";
import { ClearStatement } from "./statements/Clear.ts";

export function invoke(devices: Devices, memory: Memory, program: Program, debug: DebugState) {
  return new Invocation(devices, memory, program, debug);
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
  private debug: DebugState;
  private stopRequested: boolean = true;
  private stopped: boolean = true;
  private stepFromLine?: number;
  private stepWithinChunk?: number;
  private skipBreakpoint?: number;
  nextLine: number = 1;
  private nextChunk = 0;

  constructor(devices: Devices, memory: Memory, program: Program, debug: DebugState) {
    this.devices = devices;
    this.memory = memory;
    this.data = new ProgramData(program.data);
    this.files = new Files();
    this.events = new Events(devices);
    this.random = new RandomNumbers();
    this.errorHandling = {};
    this.program = program;
    this.debug = debug;
  }

  stop() {
    this.stopRequested = true;
  }

  async start(): Promise<void> {
    this.stopRequested = false;
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
    this.nextLine = 1;
    this.nextChunk = 0;
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
    return this.stopped || this.isAtEnd();
  }

  tick() {
  }

  async stepOneLine() {
    this.stepFromLine = this.nextLine;
    await this.start();
    this.stepFromLine = undefined;
  }

  async stepOver() {
    if (this.stack.length === 0) {
      return;
    }
    const {chunkIndex, statementIndex} = this.stack[this.stack.length - 1]!;
    const chunk = this.program.chunks[chunkIndex];
    if (!chunk) {
      throw new Error(`invalid chunk ${chunkIndex}`);
    }
    if (statementIndex >= chunk.statements.length - 1) {
      await this.stepOneLine();
      return;
    }
    this.stepWithinChunk = chunkIndex;
    await this.stepOneLine();
    this.stepWithinChunk = undefined;
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
      this.nextLine = statement.startToken.line;
      this.nextChunk = chunkIndex;
    }
    if (this.stepFromLine !== undefined) {
      // Step until we get to a statement on the next line.
      if (this.stepWithinChunk === undefined || this.stepWithinChunk === this.nextChunk) {
        // If "stepping over" function calls, must find a next line in the same chunk.
        if (this.nextLine !== this.stepFromLine) {
          this.stopRequested = true;
        }
      }
    }
    if (this.debug.breakpoints.has(this.nextLine) && this.skipBreakpoint !== this.nextLine) {
      // Skip breakpoint at the next step so we can actually proceed.
      this.skipBreakpoint = this.nextLine;
      this.stopRequested = true;
    }
    if (this.stopRequested) {
      this.stopped = true;
      this.stopRequested = false;
      return;
    }
    this.skipBreakpoint = undefined;
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
        case ControlFlowTag.STOP:
          this.stopRequested = true;
          break;
        case ControlFlowTag.WAIT:
          this.debug.blockForIo?.(true);
          await controlFlow.promise;
          this.debug.blockForIo?.(false);
          break;
        case ControlFlowTag.CLEAR: {
          const clearStatement = statement as ClearStatement;
          for (const frame of this.stack) {
            if (frame.pusher === ControlFlowTag.CALL) {
              throw RuntimeError.fromToken(statement.startToken!, ILLEGAL_FUNCTION_CALL);
            }
          }
          // Overwrite the top of stack with the current location and hope for the best.
          const top = this.stack[this.stack.length - 1];
          this.stack[0] = {...top};
          this.stack[0].pusher = undefined;
          this.stack[0].reenableEvents = undefined;
          this.stack.length = 1;
          break;
        }
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

  debugInfo(): DebugInfo {
    return this.program.debugInfo;
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