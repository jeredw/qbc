import { ControlFlow } from "../ControlFlow";
import { ExecutionContext } from "./ExecutionContext";

export abstract class Statement {
  targetIndex: number | undefined;

  abstract execute(context: ExecutionContext): ControlFlow | void;

  isExecutable(): boolean {
    return true;
  }
}