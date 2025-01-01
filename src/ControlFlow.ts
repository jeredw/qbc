export enum ControlFlowTag {
  GOTO,
  GOSUB,
  CALL,
  RETURN,
  INCREMENT,
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

export interface Increment {
  tag: ControlFlowTag.INCREMENT
}

export type ControlFlow =
  | Goto
  | Gosub
  | Call
  | Return
  | Increment;
