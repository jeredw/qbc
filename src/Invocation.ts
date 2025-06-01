import { Devices } from "./Devices.ts";
import { Program } from "./Programs.ts";
import { Memory } from "./Memory.ts";
import { ControlFlowTag } from "./ControlFlow.ts";
import { RuntimeError, RETURN_WITHOUT_GOSUB } from "./Errors.ts";
import { ReturnStatement } from "./statements/Return.ts";
import { ProgramData } from "./ProgramData.ts";
import { Files } from "./Files.ts";
import { Events } from "./Events.ts";
import { RandomNumbers } from "./RandomNumbers.ts";

export function invoke(devices: Devices, memory: Memory, program: Program) {
  return new Invocation(devices, memory, program);
}

interface ProgramLocation {
  chunkIndex: number;
  statementIndex: number;
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
  private random: RandomNumbers;
  private stack: ProgramLocation[]
  private stopped: boolean = true;

  constructor(devices: Devices, memory: Memory, program: Program) {
    this.devices = devices;
    this.memory = memory;
    this.data = new ProgramData(program.data);
    this.files = new Files();
    this.events = new Events(devices);
    this.random = new RandomNumbers();
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

  isStopped() {
    return this.stopped || this.stack.length == 0;
  }

  tick() {
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
      this.exitChunk();
      this.step();
      return;
    }
    const statement = chunk.statements[statementIndex];
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
    try {
      const controlFlow = statement.execute({
        devices: this.devices,
        memory: this.memory,
        data: this.data,
        files: this.files,
        events: this.events,
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
        case ControlFlowTag.HALT:
          this.stack = [];
          break;
        case ControlFlowTag.WAIT:
          await controlFlow.promise;
          break;
      }
    } catch (error: unknown) {
      if (error instanceof RuntimeError) {
        // TODO: ON ERROR dispatch.
      }
      throw error;
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