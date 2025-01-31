import { CallStatement, StackFrame } from "./Call.ts";
import { CaseStatement } from "./Case.ts";
import { DoTest, IfTest, LoopTest } from "./Cond.ts";
import { EndStatement } from "./End.ts";
import { ForStatement, NextStatement } from "./For.ts";
import { BranchStatement, BranchIndexStatement } from "./Branch.ts";
import { LetStatement } from "./Let.ts";
import { PrintStatement } from "./Print.ts";
import { ReturnStatement } from "./Return.ts";
import * as parser from "../../build/QBasicParser";
import { ControlFlowTag } from "../ControlFlow.ts";
import { Token } from "antlr4ng";
import { Variable } from "../Variables.ts";

export function call(chunkIndex: number, stackFrame: StackFrame[]) {
  return new CallStatement(chunkIndex, stackFrame);
}

export function case_(test: Variable, condition: parser.Case_exprContext) {
  return new CaseStatement(test, condition);
}

export function do_(isWhile: boolean, expr: parser.ExprContext) {
  return new DoTest(isWhile, expr);
}

export function elseIf(expr: parser.ExprContext) {
  return new IfTest(expr);
}

export function end() {
  return new EndStatement();
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
  return new BranchStatement({});
}

export function exitFor() {
  return new BranchStatement({});
}

export function exitFunction() {
  return new ReturnStatement(ControlFlowTag.CALL);
}

export function exitSub() {
  return new ReturnStatement(ControlFlowTag.CALL);
}

export function for_(counter: Variable, end: Variable, increment: Variable | null) {
  return new ForStatement(counter, end, increment);
}

export function goto() {
  return new BranchStatement({});
}

export function gotoIndex(expr: parser.ExprContext) {
  return new BranchIndexStatement({expr});
}

export function gosub() {
  return new BranchStatement({gosub: true});
}

export function gosubIndex(expr: parser.ExprContext) {
  return new BranchIndexStatement({gosub: true, expr});
}

export function if_(expr: parser.ExprContext) {
  return new IfTest(expr);
}

export function let_(variable: Variable, expr: parser.ExprContext) {
  return new LetStatement(variable, expr);
}

export function loop(isWhile: boolean, expr: parser.ExprContext) {
  return new LoopTest(isWhile, expr);
}

export function next(forToken: Token, counter: Variable, end: Variable, increment: Variable | null) {
  return new NextStatement(forToken, counter, end, increment);
}

export function print(ast: parser.Print_statementContext) {
  return new PrintStatement(ast);
}

export function return_(start: Token) {
  return new ReturnStatement(ControlFlowTag.GOSUB, start);
}

export function while_(expr: parser.ExprContext) {
  return new DoTest(true, expr);
}