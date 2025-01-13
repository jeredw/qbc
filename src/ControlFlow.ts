import type { Variable } from './Variables.ts'
import type { Value } from './Values.ts'

export enum ControlFlowTag {
  GOTO,
  GOSUB,
  CALL,
  RETURN,
  HALT,
}

export interface Goto {
  tag: ControlFlowTag.GOTO;
}

export interface Gosub {
  tag: ControlFlowTag.GOSUB;
}

export interface Call {
  tag: ControlFlowTag.CALL;
  chunkIndex: number;
  savedValues?: SavedValue[];
}

export interface SavedValue {
  variable: Variable;
  value: Value;
}

export interface Return {
  tag: ControlFlowTag.RETURN;
  where: ControlFlowTag;
}

export interface Halt {
  tag: ControlFlowTag.HALT;
}

export type ControlFlow =
  | Goto
  | Gosub
  | Call
  | Return
  | Halt;