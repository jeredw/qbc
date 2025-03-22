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
import {
  ChdirStatement,
  CloseStatement,
  EofFunction,
  FilesStatement,
  KillStatement,
  LocFunction,
  LofFunction,
  MkdirStatement,
  NameStatement,
  OpenArgs,
  OpenStatement,
  RmdirStatement,
  SeekFunction,
  SeekStatement
} from "./FileSystem.ts";
import { PrintStatement, PrintStatementArgs, PrintUsingStatement } from "./Print.ts";
import { ReturnStatement } from "./Return.ts";
import {
  HexFunction,
  InstrFunction,
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
import { Builtin, BuiltinStatementArgs } from "../Builtins.ts";
import { InkeyFunction } from "./Inkey.ts";
import { InpFunction } from "./Ports.ts";
import { InputStatement, InputStatementArgs, LineInputStatement } from "./Input.ts";
import { DateFunction, DateStatement, TimeFunction, TimerFunction, TimeStatement } from "./Time.ts";

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

export function chdir(args: BuiltinStatementArgs) {
  return new ChdirStatement(args);
}

export function chr(args: BuiltinStatementArgs) {
  return new ChrFunction(args);
}

export function close(fileNumber: parser.ExprContext) {
  return new CloseStatement(fileNumber);
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

export function dateFunction(result: Variable) {
  return new DateFunction(result);
}

export function dateStatement(token: Token, expr: parser.ExprContext) {
  return new DateStatement(token, expr);
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

export function eof(args: BuiltinStatementArgs) {
  return new EofFunction(args);
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

export function files(args: BuiltinStatementArgs) {
  return new FilesStatement(args);
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

export function inkey(args: BuiltinStatementArgs) {
  return new InkeyFunction(args);
}

export function inp(args: BuiltinStatementArgs) {
  return new InpFunction(args);
}

export function input(args: InputStatementArgs) {
  return new InputStatement(args);
}

export function indexArray(array: Variable, indexExprs: parser.ExprContext[], result: Variable) {
  return new IndexArrayStatement(array, indexExprs, result);
}

export function instr(token: Token, start: parser.ExprContext | undefined, haystack: parser.ExprContext, needle: parser.ExprContext, result: Variable) {
  return new InstrFunction(token, start, haystack, needle, result);
}

export function int(args: BuiltinStatementArgs) {
  return new IntFunction(args);
}

export function kill(args: BuiltinStatementArgs) {
  return new KillStatement(args);
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

export function lineInput(args: InputStatementArgs) {
  return new LineInputStatement(args);
}

export function loc(args: BuiltinStatementArgs) {
  return new LocFunction(args);
}

export function lof(args: BuiltinStatementArgs) {
  return new LofFunction(args);
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

export function mkdir(args: BuiltinStatementArgs) {
  return new MkdirStatement(args);
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

export function name(token: Token, oldPathExpr: parser.ExprContext, newPathExpr: parser.ExprContext) {
  return new NameStatement(token, oldPathExpr, newPathExpr);
}

export function next(forToken: Token, counter: Variable, end: Variable, increment: Variable | null) {
  return new NextStatement(forToken, counter, end, increment);
}

export function oct(args: BuiltinStatementArgs) {
  return new OctFunction(args);
}

export function open(args: OpenArgs) {
  return new OpenStatement(args);
}

export function print(args: PrintStatementArgs) {
  return new PrintStatement(args);
}

export function printUsing(args: PrintStatementArgs) {
  return new PrintUsingStatement(args);
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

export function rmdir(args: BuiltinStatementArgs) {
  return new RmdirStatement(args);
}

export function rtrim(args: BuiltinStatementArgs) {
  return new RtrimFunction(args);
}

export function seekFunction(token: Token, fileNumber: parser.ExprContext, result: Variable) {
  return new SeekFunction(token, fileNumber, result);
}

export function seekStatement(token: Token, fileNumber: parser.ExprContext, offset: parser.ExprContext) {
  return new SeekStatement(token, fileNumber, offset);
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

export function timeFunction(result: Variable) {
  return new TimeFunction(result);
}

export function timeStatement(token: Token, expr: parser.ExprContext) {
  return new TimeStatement(token, expr);
}

export function timer(result: Variable) {
  return new TimerFunction(result);
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