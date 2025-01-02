import { DefFnStatement } from "./DefFn.ts";
import { GosubStatement } from "./Gosub.ts";
import { GotoStatement } from "./Goto.ts";
import { DoTest, IfTest, LoopTest } from "./Cond.ts";
import { PrintStatement } from "./Print.ts";
import { ReturnStatement } from "./Return.ts";
import { Type } from "../Types";
import * as parser from "../../build/QBasicParser";
import { ControlFlowTag } from "../ControlFlow.ts";
import { Token } from "antlr4ng";

export function defFn(name: string, returnType: Type) {
  return new DefFnStatement(name, returnType);
}

export function do_(isWhile: boolean, expr: parser.ExprContext) {
  return new DoTest(isWhile, expr);
}

export function elseIf(expr: parser.ExprContext) {
  return new IfTest(expr);
}

export function endFunction() {
  return new ReturnStatement(ControlFlowTag.CALL);
}

export function endSub() {
  return new ReturnStatement(ControlFlowTag.CALL);
}

export function exitDef() {
  return new ReturnStatement(ControlFlowTag.CALL);
}

export function exitDo() {
  return new GotoStatement();
}

export function exitFor() {
  return new GotoStatement();
}

export function exitFunction() {
  return new ReturnStatement(ControlFlowTag.CALL);
}

export function exitSub() {
  return new ReturnStatement(ControlFlowTag.CALL);
}

export function goto() {
  return new GotoStatement();
}

export function gosub() {
  return new GosubStatement();
}

export function if_(expr: parser.ExprContext) {
  return new IfTest(expr);
}

export function loop(isWhile: boolean, expr: parser.ExprContext) {
  return new LoopTest(isWhile, expr);
}

export function next() {
  return new GotoStatement();
}

export function print(ast: parser.Print_statementContext) {
  return new PrintStatement(ast);
}

export function return_(start: Token) {
  return new ReturnStatement(ControlFlowTag.GOSUB, start);
}