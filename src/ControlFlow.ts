export enum ControlFlowTag {
  GOTO,
  GOSUB,
  CALL,
  RETURN,
  HALT,
}

export interface Goto {
  tag: ControlFlowTag.GOTO
}

export interface Gosub {
  tag: ControlFlowTag.GOSUB
}

export interface Call {
  tag: ControlFlowTag.CALL
  chunkIndex: number;
}

export interface Return {
  tag: ControlFlowTag.RETURN
}

export interface Halt {
  tag: ControlFlowTag.HALT
}

export type ControlFlow =
  | Goto
  | Gosub
  | Call
  | Return
  | Halt;