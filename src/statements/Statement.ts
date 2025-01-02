import { ControlFlow } from "../ControlFlow";
import { ExecutionContext } from "./ExecutionContext";

export abstract class Statement {
  // If defined, index of statement this statement may branch to.
  targetIndex: number | undefined;

  abstract execute(context: ExecutionContext): ControlFlow | void;

  isExecutable(): boolean {
    return true;
  }
}