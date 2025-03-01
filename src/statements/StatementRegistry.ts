import {
  AbsFunction,
  AtnFunction,
  CosFunction,
  ExpFunction,
  FixFunction,
  IntFunction,
  LogFunction,
  SinFunction,
  SgnFunction,
  SqrFunction,
  TanFunction
 } from "./Math.ts";
import {
  DimBoundsExprs,
  DimStatement,
  IndexArrayStatement,
  LboundFunction,
  UboundFunction
} from "./Arrays.ts";
import { AscFunction } from "./Asc.ts";
import { BeepStatement } from "./Beep.ts";
import { BranchStatement, BranchIndexStatement } from "./Branch.ts";
import { CallStatement, StackVariable } from "./Call.ts";
import { CaseStatement } from "./Case.ts";
import { ChrFunction } from "./Chr.ts";
import { DoTest, IfTest, LoopTest } from "./Cond.ts";
import {
  CdblFunction,
  CintFunction,
  ClngFunction,
  CsngFunction,
  CvdFunction,
  CvdmbfFunction,
  CviFunction,
  CvlFunction,
  CvsFunction,
  CvsmbfFunction,
  MkdFunction,
  MkdmbfFunction,
  MkiFunction,
  MklFunction,
  MksFunction,
  MksmbfFunction
} from "./Convert.ts";
import { ReadStatement, RestoreStatement } from "./Data.ts";
import { EndStatement } from "./End.ts";
import { ForStatement, NextStatement } from "./For.ts";
import { LetStatement } from "./Let.ts";
import { PrintArgument, PrintStatement, PrintUsingStatement } from "./Print.ts";
import { ReturnStatement } from "./Return.ts";
import {
  HexFunction,
  LcaseFunction,
  LeftFunction,
  LtrimFunction,
  MidFunction,
  OctFunction,
  RightFunction,
  RtrimFunction,
  SpaceFunction,
  StrFunction,
  UcaseFunction,
  ValFunction,
} from "./Strings.ts";
import * as parser from "../../build/QBasicParser.ts";
import { ControlFlowTag } from "../ControlFlow.ts";
import { Token } from "antlr4ng";
import { Variable } from "../Variables.ts";
import { BuiltinStatementArgs } from "../Builtins.ts";

export function abs(args: BuiltinStatementArgs) {
  return new AbsFunction(args);
}

export function asc(args: BuiltinStatementArgs) {
  return new AscFunction(args);
}

export function atn(args: BuiltinStatementArgs) {
  return new AtnFunction(args);
}

export function beep(_args: BuiltinStatementArgs) {
  return new BeepStatement();
}

export function call(chunkIndex: number, stackVariables: StackVariable[]) {
  return new CallStatement(chunkIndex, stackVariables);
}

export function case_(test: Variable, condition: parser.Case_exprContext) {
  return new CaseStatement(test, condition);
}

export function cdbl(args: BuiltinStatementArgs) {
  return new CdblFunction(args);
}

export function chr(args: BuiltinStatementArgs) {
  return new ChrFunction(args);
}

export function csng(args: BuiltinStatementArgs) {
  return new CsngFunction(args);
}

export function cint(args: BuiltinStatementArgs) {
  return new CintFunction(args);
}

export function clng(args: BuiltinStatementArgs) {
  return new ClngFunction(args);
}

export function cos(args: BuiltinStatementArgs) {
  return new CosFunction(args);
}

export function cvi(args: BuiltinStatementArgs) {
  return new CviFunction(args);
}

export function cvd(args: BuiltinStatementArgs) {
  return new CvdFunction(args);
}

export function cvdmbf(args: BuiltinStatementArgs) {
  return new CvdmbfFunction(args);
}

export function cvl(args: BuiltinStatementArgs) {
  return new CvlFunction(args);
}

export function cvs(args: BuiltinStatementArgs) {
  return new CvsFunction(args);
}

export function cvsmbf(args: BuiltinStatementArgs) {
  return new CvsmbfFunction(args);
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

export function exp(args: BuiltinStatementArgs) {
  return new ExpFunction(args);
}

export function fix(args: BuiltinStatementArgs) {
  return new FixFunction(args);
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

export function hex(args: BuiltinStatementArgs) {
  return new HexFunction(args);
}

export function if_(expr: parser.ExprContext) {
  return new IfTest(expr);
}

export function indexArray(array: Variable, indexExprs: parser.ExprContext[], result: Variable) {
  return new IndexArrayStatement(array, indexExprs, result);
}

export function int(args: BuiltinStatementArgs) {
  return new IntFunction(args);
}

export function lbound(token: Token, array: Variable, result: Variable, whichExpr?: parser.ExprContext) {
  return new LboundFunction(token, array, result, whichExpr);
}

export function lcase(args: BuiltinStatementArgs) {
  return new LcaseFunction(args);
}

export function left(args: BuiltinStatementArgs) {
  return new LeftFunction(args);
}

export function ltrim(args: BuiltinStatementArgs) {
  return new LtrimFunction(args);
}

export function mid(
  token: Token,
  string: parser.ExprContext,
  start: parser.ExprContext,
  length: parser.ExprContext | undefined,
  result: Variable) {
  return new MidFunction(token, string, start, length, result);
}

export function let_(variable: Variable, expr: parser.ExprContext) {
  return new LetStatement(variable, expr);
}

export function loop(isWhile: boolean, expr: parser.ExprContext) {
  return new LoopTest(isWhile, expr);
}

export function log(args: BuiltinStatementArgs) {
  return new LogFunction(args);
}

export function mki(args: BuiltinStatementArgs) {
  return new MkiFunction(args);
}

export function mkd(args: BuiltinStatementArgs) {
  return new MkdFunction(args);
}

export function mkdmbf(args: BuiltinStatementArgs) {
  return new MkdmbfFunction(args);
}

export function mkl(args: BuiltinStatementArgs) {
  return new MklFunction(args);
}

export function mks(args: BuiltinStatementArgs) {
  return new MksFunction(args);
}

export function mksmbf(args: BuiltinStatementArgs) {
  return new MksmbfFunction(args);
}

export function next(forToken: Token, counter: Variable, end: Variable, increment: Variable | null) {
  return new NextStatement(forToken, counter, end, increment);
}

export function oct(args: BuiltinStatementArgs) {
  return new OctFunction(args);
}

export function print(args: PrintArgument[]) {
  return new PrintStatement(args);
}

export function printUsing(format: parser.ExprContext, args: PrintArgument[]) {
  return new PrintUsingStatement(format, args);
}

export function read(token: Token, result: Variable) {
  return new ReadStatement(token, result);
}

export function restore() {
  return new RestoreStatement();
}

export function return_(start: Token) {
  return new ReturnStatement(ControlFlowTag.GOSUB, start);
}

export function right(args: BuiltinStatementArgs) {
  return new RightFunction(args);
}

export function rtrim(args: BuiltinStatementArgs) {
  return new RtrimFunction(args);
}

export function sgn(args: BuiltinStatementArgs) {
  return new SgnFunction(args);
}

export function sin(args: BuiltinStatementArgs) {
  return new SinFunction(args);
}

export function sqr(args: BuiltinStatementArgs) {
  return new SqrFunction(args);
}

export function str(args: BuiltinStatementArgs) {
  return new StrFunction(args);
}

export function space(args: BuiltinStatementArgs) {
  return new SpaceFunction(args);
}

export function tan(args: BuiltinStatementArgs) {
  return new TanFunction(args);
}

export function ubound(token: Token, array: Variable, result: Variable, whichExpr?: parser.ExprContext) {
  return new UboundFunction(token, array, result, whichExpr);
}

export function ucase(args: BuiltinStatementArgs) {
  return new UcaseFunction(args);
}

export function val(args: BuiltinStatementArgs) {
  return new ValFunction(args);
}

export function while_(expr: parser.ExprContext) {
  return new DoTest(true, expr);
}