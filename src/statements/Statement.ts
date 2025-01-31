import { ControlFlow } from "../ControlFlow";
import { ExecutionContext } from "./ExecutionContext";

export abstract class Statement {
  // If defined, index of statement this statement may branch to.
  targetIndex: number | undefined;
  // ON...GOTO and ON...GOSUB can have multiple targets.
  targets: number[];

  abstract execute(context: ExecutionContext): ControlFlow | void;
}