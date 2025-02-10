export enum ControlFlowTag {
  GOTO,
  GOSUB,
  CALL,
  RETURN,
  HALT,
  WAIT,
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

export interface Halt {
  tag: ControlFlowTag.HALT;
}

export interface Wait {
  tag: ControlFlowTag.WAIT;
  promise: Promise<void>;
}

export type ControlFlow =
  | Goto
  | Gosub
  | Call
  | Return
  | Halt
  | Wait;