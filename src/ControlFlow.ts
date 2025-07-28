export enum ControlFlowTag {
  GOTO,
  GOSUB,
  CALL,
  RETURN,
  RESUME,
  HALT,
  WAIT,
  STOP,
  CLEAR,
  RUN,
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
}

export interface Return {
  tag: ControlFlowTag.RETURN;
  where: ControlFlowTag;
}

export interface Resume {
  tag: ControlFlowTag.RESUME;
  targetIndex?: number;
  next?: boolean;
}

export interface Halt {
  tag: ControlFlowTag.HALT;
}

export interface Wait {
  tag: ControlFlowTag.WAIT;
  promise: Promise<void>;
}

export interface Stop {
  tag: ControlFlowTag.STOP;
}

export interface Clear {
  tag: ControlFlowTag.CLEAR;
}

export interface Run {
  tag: ControlFlowTag.RUN;
  program?: string;
}

export type ControlFlow =
  | Goto
  | Gosub
  | Call
  | Return
  | Resume
  | Halt
  | Wait
  | Stop
  | Clear
  | Run;