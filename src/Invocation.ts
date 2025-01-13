import { Devices } from "./Devices";
import { Program } from "./Programs";
import { ControlFlowTag, SavedValue } from "./ControlFlow";
import { RuntimeError } from "./Errors";
import { ReturnStatement } from "./statements/Return";
import { RETURN_WITHOUT_GOSUB } from "./Values";

export function invoke(devices: Devices, program: Program) {
  return new Invocation(devices, program);
}

interface ProgramLocation {
  chunkIndex: number;
  statementIndex: number;
  pusher?: ControlFlowTag;
  savedValues?: SavedValue[];
}

export class Invocation {
  private devices: Devices;
  private program: Program;
  private stack: ProgramLocation[]
  private stopped: boolean = true;

  constructor(devices: Devices, program: Program) {
    this.devices = devices;
    this.program = program;
  }

  stop() {
    this.stopped = true;
  }

  start(): Promise<void> {
    this.stopped = false;
    const nextStep = (resolve: Function, reject: Function) => {
      try {
        this.step();
        if (!this.isStopped()) {
          setTimeout(() => nextStep(resolve, reject));
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

  restart(): Promise<void> {
    const chunks = this.program.chunks;
    this.stack = [];
    if (chunks.length > 0 && chunks[0].statements.length > 0) {
      this.stack.push({chunkIndex: 0, statementIndex: 0});
    }
    return this.start();
  }

  isStopped() {
    return this.stopped || this.stack.length == 0;
  }

  step() {
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
    try {
      const controlFlow = statement.execute({devices: this.devices});
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
            savedValues: controlFlow.savedValues,
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
            this.stack.pop();
            if (statement.targetIndex !== undefined) {
              // For RETURN to a specific label.
              this.stack[this.stack.length - 1].statementIndex = statement.targetIndex;
            }
          } else if (controlFlow.where == ControlFlowTag.CALL) {
            this.exitChunk();
          }
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
    if (callFrame && callFrame.savedValues) {
      for (const {variable, value} of callFrame.savedValues) {
        variable.value = value;
      }
    }
    this.stack.pop();
  }

  private discardGosubFrames() {
    while (this.stack.length && this.stack[this.stack.length - 1].pusher == ControlFlowTag.GOSUB) {
      this.stack.pop();
    }
  }
}