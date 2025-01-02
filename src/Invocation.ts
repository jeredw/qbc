import { Devices } from "./Devices";
import { Program } from "./Programs";
import { ControlFlowTag } from "./ControlFlow";
import { RuntimeError } from "./Errors";

export function invoke(devices: Devices, program: Program) {
  return new Invocation(devices, program);
}

interface ProgramLocation {
  chunkIndex: number;
  statementIndex: number;
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
    this.stack = [{chunkIndex: 0, statementIndex: 0}];
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
    const statement = chunk.statements[statementIndex];
    try {
      const controlFlow = statement.execute({
        symbols: chunk.symbols,
        devices: this.devices,
      });
      if (!controlFlow) {
        if (statementIndex >= chunk.statements.length - 1) {
          this.stack.pop();
        } else {
          this.stack[this.stack.length - 1] = {
            chunkIndex, statementIndex: statementIndex + 1
          };
        }
        return;
      }
      switch (controlFlow.tag) {
        case ControlFlowTag.GOTO:
          if (statement.targetIndex === undefined) {
            throw new Error("missing target for GOTO")
          }
          if (statement.targetIndex >= chunk.statements.length) {
            this.stack.pop();
          } else {
            this.stack[this.stack.length - 1] = {
              chunkIndex,
              statementIndex: statement.targetIndex
            };
          }
          break;
        case ControlFlowTag.GOSUB:
          if (statement.targetIndex === undefined) {
            throw new Error("missing target for GOSUB")
          }
          if (statement.targetIndex >= chunk.statements.length) {
            this.stack.pop();
          } else {
            this.stack.push({
              chunkIndex,
              statementIndex: statement.targetIndex
            });
          }
          break;
        case ControlFlowTag.CALL:
          this.stack.push({
            chunkIndex: controlFlow.chunkIndex,
            statementIndex: 0
          });
          break;
        case ControlFlowTag.RETURN:
          this.stack.pop();
          break;
      }
    } catch (error: unknown) {
      if (error instanceof RuntimeError) {
        // TODO: ON ERROR dispatch.
      }
      throw error;
    }
  }
}