import { ParserRuleContext } from "antlr4ng";
import { Devices } from "./Devices";
import { Program, ProgramChunk, Statement } from "./Programs";
import { Goto_statementContext, Print_statementContext } from "../build/QBasicParser";
import { ControlFlow, ControlFlowTag } from "./ControlFlow";
import { evaluateExpression } from "./Expressions";
import { isNumeric, isString } from "./Values";

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
    const controlFlow = this.execute(chunk, statement);
    switch (controlFlow.tag) {
      case ControlFlowTag.INCREMENT:
        if (statementIndex >= chunk.statements.length - 1) {
          this.stack.pop();
        } else {
          this.stack[this.stack.length - 1] = {
            chunkIndex, statementIndex: statementIndex + 1
          };
        }
        break;
      case ControlFlowTag.RETURN:
        this.stack.pop();
        break;
      case ControlFlowTag.GOTO:
        this.stack[this.stack.length - 1] = {
          chunkIndex,
          statementIndex: statement.targetIndex!
        };
        break;
      case ControlFlowTag.GOSUB:
        this.stack.push({
          chunkIndex,
          statementIndex: statement.targetIndex!
        });
        break;
      case ControlFlowTag.CALL:
        this.stack.push({
          chunkIndex: controlFlow.chunkIndex,
          statementIndex: 0
        });
        break;
    }
  }

  private execute(chunk: ProgramChunk, statement: Statement): ControlFlow {
    if (statement.rule instanceof Goto_statementContext) {
      return {tag: ControlFlowTag.GOTO};
    }
    if (statement.rule instanceof Print_statementContext) {
      const ctx = statement.rule as Print_statementContext;
      for (const expr of ctx.expr()) {
        const value = evaluateExpression({
          expr, symbols: chunk.symbols
        });
        if (isNumeric(value)) {
          this.devices.textScreen.print(value.number.toString(), true);
        } else if (isString(value)) {
          this.devices.textScreen.print(value.string, true);
        }
      }
    }
    return {tag: ControlFlowTag.INCREMENT};
  }
}