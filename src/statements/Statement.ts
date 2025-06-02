import { ControlFlow } from "../ControlFlow.ts";
import { ExecutionContext } from "./ExecutionContext.ts";

export abstract class Statement {
  // If defined, index of statement this statement may branch to.
  targetIndex?: number;
  // If defined, the line number label for this statement (used for ERL).
  lineNumber?: number;
  // ON...GOTO and ON...GOSUB can have multiple targets.
  targets: number[];

  abstract execute(context: ExecutionContext): ControlFlow | void;
}