import { AbsFunction } from "./Abs.ts";
import { DimBoundsExprs, DimStatement, IndexArrayStatement,
         LboundFunction, UboundFunction } from "./Arrays.ts";
import { AscFunction } from "./Asc.ts";
import { AtnFunction, CosFunction, SinFunction, TanFunction } from "./Trig.ts";
import { BeepStatement } from "./Beep.ts";
import { BranchStatement, BranchIndexStatement } from "./Branch.ts";
import { CallStatement, StackVariable } from "./Call.ts";
import { CaseStatement } from "./Case.ts";
import { ChrFunction } from "./Chr.ts";
import { DoTest, IfTest, LoopTest } from "./Cond.ts";
import { CdblFunction, CintFunction, ClngFunction, CsngFunction,
         CvdFunction, CvdmbfFunction, CviFunction, CvlFunction, CvsFunction, CvsmbfFunction,
         MkdFunction, MkdmbfFunction, MkiFunction, MklFunction, MksFunction, MksmbfFunction } from "./Convert.ts";
import { EndStatement } from "./End.ts";
import { ForStatement, NextStatement } from "./For.ts";
import { LetStatement } from "./Let.ts";
import { ExpFunction, LogFunction } from "./Log.ts";
import { PrintStatement } from "./Print.ts";
import { ReturnStatement } from "./Return.ts";
import * as parser from "../../build/QBasicParser.ts";
import { ControlFlowTag } from "../ControlFlow.ts";
import { Token } from "antlr4ng";
import { Variable } from "../Variables.ts";
import { BuiltinStatementArgs } from "../Builtins.ts";

export function abs(params: BuiltinStatementArgs) {
  return new AbsFunction(params);
}

export function asc(params: BuiltinStatementArgs) {
  return new AscFunction(params);
}

export function atn(params: BuiltinStatementArgs) {
  return new AtnFunction(params);
}

export function beep(_params: BuiltinStatementArgs) {
  return new BeepStatement();
}

export function call(chunkIndex: number, stackVariables: StackVariable[]) {
  return new CallStatement(chunkIndex, stackVariables);
}

export function case_(test: Variable, condition: parser.Case_exprContext) {
  return new CaseStatement(test, condition);
}

export function cdbl(params: BuiltinStatementArgs) {
  return new CdblFunction(params);
}

export function chr(params: BuiltinStatementArgs) {
  return new ChrFunction(params);
}

export function csng(params: BuiltinStatementArgs) {
  return new CsngFunction(params);
}

export function cint(params: BuiltinStatementArgs) {
  return new CintFunction(params);
}

export function clng(params: BuiltinStatementArgs) {
  return new ClngFunction(params);
}

export function cos(params: BuiltinStatementArgs) {
  return new CosFunction(params);
}

export function cvi(params: BuiltinStatementArgs) {
  return new CviFunction(params);
}

export function cvd(params: BuiltinStatementArgs) {
  return new CvdFunction(params);
}

export function cvdmbf(params: BuiltinStatementArgs) {
  return new CvdmbfFunction(params);
}

export function cvl(params: BuiltinStatementArgs) {
  return new CvlFunction(params);
}

export function cvs(params: BuiltinStatementArgs) {
  return new CvsFunction(params);
}

export function cvsmbf(params: BuiltinStatementArgs) {
  return new CvsmbfFunction(params);
}

export function dim(arrayBaseIndex: number, token: Token, bounds: DimBoundsExprs[], result: Variable) {
  return new DimStatement(arrayBaseIndex, token, bounds, result);
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

export function exp(params: BuiltinStatementArgs) {
  return new ExpFunction(params);
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

export function indexArray(array: Variable, indexExprs: parser.ExprContext[], result: Variable) {
  return new IndexArrayStatement(array, indexExprs, result);
}

export function lbound(token: Token, array: Variable, result: Variable, whichExpr?: parser.ExprContext) {
  return new LboundFunction(token, array, result, whichExpr);
}

export function let_(variable: Variable, expr: parser.ExprContext) {
  return new LetStatement(variable, expr);
}

export function loop(isWhile: boolean, expr: parser.ExprContext) {
  return new LoopTest(isWhile, expr);
}

export function log(params: BuiltinStatementArgs) {
  return new LogFunction(params);
}

export function mki(params: BuiltinStatementArgs) {
  return new MkiFunction(params);
}

export function mkd(params: BuiltinStatementArgs) {
  return new MkdFunction(params);
}

export function mkdmbf(params: BuiltinStatementArgs) {
  return new MkdmbfFunction(params);
}

export function mkl(params: BuiltinStatementArgs) {
  return new MklFunction(params);
}

export function mks(params: BuiltinStatementArgs) {
  return new MksFunction(params);
}

export function mksmbf(params: BuiltinStatementArgs) {
  return new MksmbfFunction(params);
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

export function sin(params: BuiltinStatementArgs) {
  return new SinFunction(params);
}

export function tan(params: BuiltinStatementArgs) {
  return new TanFunction(params);
}

export function ubound(token: Token, array: Variable, result: Variable, whichExpr?: parser.ExprContext) {
  return new UboundFunction(token, array, result, whichExpr);
}

export function while_(expr: parser.ExprContext) {
  return new DoTest(true, expr);
}