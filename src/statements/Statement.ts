import { Token } from "antlr4ng";
import { ControlFlow } from "../ControlFlow.ts";
import { ExecutionContext } from "./ExecutionContext.ts";

export abstract class Statement {
  // If defined, index of statement this statement may branch to.
  targetIndex?: number;
  // If defined, the line number label for this statement (used for ERL).
  lineNumber?: number;
  // ON...GOTO and ON...GOSUB can have multiple targets.
  targets: number[];
  // Where this statement starts in program text.  Used for debugging.
  // Maybe undefined for synthetic statements such as gotos for skipping out of blocks.
  startToken?: Token;

  abstract execute(context: ExecutionContext): ControlFlow | void;
}