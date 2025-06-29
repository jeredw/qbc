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
  TanFunction,
  RandomizeStatement,
  RndFunction
 } from "./Math.ts";
import {
  DimBoundsExprs,
  DimStatement,
  EraseStatement,
  IndexArrayStatement,
  LboundFunction,
  UboundFunction
} from "./Arrays.ts";
import { BeepStatement, PlayFunction, PlayStatement, SoundStatement } from "./Sound.ts";
import { BranchStatement, BranchIndexStatement } from "./Branch.ts";
import { Binding, CallStatement } from "./Call.ts";
import { CaseStatement } from "./Case.ts";
import { DoTest, IfTest, LoopTest } from "./Cond.ts";
import {
  BloadStatement,
  BsaveStatement,
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
  DefSegStatement,
  LenStatement,
  LsetRecordStatement,
  MkdFunction,
  MkdmbfFunction,
  MkiFunction,
  MklFunction,
  MksFunction,
  MksmbfFunction,
  PeekStatement,
  PokeStatement,
  VarPtrFunction,
  VarPtrStringFunction,
  VarSegFunction
} from "./Bits.ts";
import { ReadStatement, RestoreStatement } from "./Data.ts";
import { EndStatement, NoOpStatement, StopStatement } from "./End.ts";
import { ForStatement, NextStatement } from "./For.ts";
import { LetStatement, SwapStatement } from "./Assignment.ts";
import {
  ChdirStatement,
  CloseStatement,
  EofFunction,
  FieldDefinition,
  FieldStatement,
  FileattrFunction,
  FilesStatement,
  FreefileFunction,
  GetIoStatement,
  KillStatement,
  LocFunction,
  LofFunction,
  MkdirStatement,
  NameStatement,
  OpenArgs,
  OpenStatement,
  PutIoStatement,
  ResetStatement,
  RmdirStatement,
  SeekFunction,
  SeekStatement,
  WidthFileStatement
} from "./FileSystem.ts";
import {
  LposFunction,
  PrintStatement,
  PrintStatementArgs,
  PrintUsingStatement,
  WidthLprintStatement,
  WriteStatement
} from "./Print.ts";
import { ReturnStatement } from "./Return.ts";
import {
  AscFunction,
  ChrFunction,
  HexFunction,
  InstrFunction,
  LcaseFunction,
  LeftFunction,
  LsetStringStatement,
  LtrimFunction,
  MidFunction,
  MidStatement,
  OctFunction,
  RightFunction,
  RsetStringStatement,
  RtrimFunction,
  SpaceFunction,
  StrFunction,
  StringFunction,
  UcaseFunction,
  ValFunction,
} from "./Strings.ts";
import * as parser from "../../build/QBasicParser.ts";
import { ControlFlowTag } from "../ControlFlow.ts";
import { Token } from "antlr4ng";
import { Variable } from "../Variables.ts";
import { Builtin, BuiltinStatementArgs } from "../Builtins.ts";
import { InkeyFunction, KeyStatement, KeyStatementArgs } from "./Keyboard.ts";
import { InpFunction } from "./Ports.ts";
import { InputFileStatement, InputFunction, InputStatement, InputStatementArgs, LineInputStatement } from "./Input.ts";
import { DateFunction, DateStatement, TimeFunction, TimerFunction, TimeStatement } from "./Time.ts";
import { EventControlStatement, EventHandlerStatement, EventType, SleepStatement } from "./Events.ts";
import { EventChannelState } from "../Events.ts";
import { StickFunction, StrigFunction } from "./Joystick.ts";
import { PenFunction } from "./LightPen.ts";
import {
  CircleStatement,
  CircleStatementArgs,
  ClsStatement,
  ColorStatement,
  CsrlinFunction,
  DrawStatement,
  GetGraphicsStatement,
  GetGraphicsStatementArgs,
  LineStatement,
  LineStatementArgs,
  LocateStatement,
  PaintStatement,
  PaintStatementArgs,
  PaletteStatement,
  PmapFunction,
  PointFunction,
  PosFunction,
  PresetStatement,
  PsetStatement,
  PutGraphicsStatement,
  PutGraphicsStatementArgs,
  ScreenFunction,
  ScreenStatement,
  ViewPrintStatement,
  ViewStatement,
  WidthScreenStatement,
  WindowStatement,
} from "./Graphics.ts";
import { ErdevFunction, ErdevStringFunction, ErlFunction, ErrFunction, ErrorHandlerStatement, ErrorStatement, ResumeStatement } from "./Errors.ts";
import { CommandFunction } from "./Dos.ts";

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

export function bload(args: BuiltinStatementArgs) {
  return new BloadStatement(args);
}

export function bsave(args: BuiltinStatementArgs) {
  return new BsaveStatement(args);
}

export function call(chunkIndex: number, bindings: Binding[], stackSize: number) {
  return new CallStatement(chunkIndex, bindings, stackSize);
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

export function circle(args: CircleStatementArgs) {
  return new CircleStatement(args);
}

export function close(fileNumber: parser.ExprContext) {
  return new CloseStatement(fileNumber);
}

export function color(token: Token, arg1?: parser.ExprContext, arg2?: parser.ExprContext, arg3?: parser.ExprContext) {
  return new ColorStatement(token, arg1, arg2, arg3);
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

export function cls(args: BuiltinStatementArgs) {
  return new ClsStatement(args);
}

export function command(args: BuiltinStatementArgs) {
  return new CommandFunction(args);
}

export function cos(args: BuiltinStatementArgs) {
  return new CosFunction(args);
}

export function csrlin(args: BuiltinStatementArgs) {
  return new CsrlinFunction(args);
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

export function defSeg(token: Token, segmentExpr?: parser.ExprContext) {
  return new DefSegStatement(token, segmentExpr);
}

export function dim(arrayBaseIndex: number, token: Token, bounds: DimBoundsExprs[], result: Variable, redim: boolean) {
  return new DimStatement(arrayBaseIndex, token, bounds, result, redim);
}

export function erase(array: Variable) {
  return new EraseStatement(array);
}

export function do_(isWhile: boolean, expr: parser.ExprContext) {
  return new DoTest(isWhile, expr);
}

export function draw(args: BuiltinStatementArgs) {
  return new DrawStatement(args);
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

export function errorHandler(token: Token) {
  return new ErrorHandlerStatement(token);
}

export function erdev(result: Variable) {
  return new ErdevFunction(result);
}

export function erdevString(result: Variable) {
  return new ErdevStringFunction(result);
}

export function erl(args: BuiltinStatementArgs) {
  return new ErlFunction(args);
}

export function err(args: BuiltinStatementArgs) {
  return new ErrFunction(args);
}

export function error(token: Token, errorCodeExpr: parser.ExprContext) {
  return new ErrorStatement(token, errorCodeExpr);
}

export function eventControl(token: Token, eventType: EventType, param: parser.ExprContext | undefined, state: EventChannelState) {
  return new EventControlStatement(token, eventType, param, state);
}

export function eventHandler(token: Token, eventType: EventType, param: parser.ExprContext | undefined) {
  return new EventHandlerStatement(token, eventType, param);
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

export function field(token: Token, fileNumber: parser.ExprContext, fields: FieldDefinition[]) {
  return new FieldStatement(token, fileNumber, fields);
}

export function fileattr(args: BuiltinStatementArgs) {
  return new FileattrFunction(args);
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

export function freefile(args: BuiltinStatementArgs) {
  return new FreefileFunction(args);
}

export function getIo(
  token: Token,
  fileNumber: parser.ExprContext,
  recordNumber?: parser.ExprContext,
  variable?: Variable
) {
  return new GetIoStatement(token, fileNumber, recordNumber, variable);
}

export function getGraphics(args: GetGraphicsStatementArgs) {
  return new GetGraphicsStatement(args);
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

export function inputFile(args: InputStatementArgs) {
  return new InputFileStatement(args);
}

export function inputFunction(token: Token, n: parser.ExprContext, fileNumber: parser.ExprContext | undefined, result: Variable) {
  return new InputFunction(token, n, fileNumber, result);
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

export function key(args: KeyStatementArgs) {
  return new KeyStatement(args);
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

export function locate(
  token: Token,
  row?: parser.ExprContext,
  column?: parser.ExprContext,
  cursor?: parser.ExprContext,
  start?: parser.ExprContext,
  stop?: parser.ExprContext
) {
  return new LocateStatement(token, row, column, cursor, start, stop);
}

export function lof(args: BuiltinStatementArgs) {
  return new LofFunction(args);
}

export function ltrim(args: BuiltinStatementArgs) {
  return new LtrimFunction(args);
}

export function midFunction(
  token: Token,
  string: parser.ExprContext,
  start: parser.ExprContext,
  length: parser.ExprContext | undefined,
  result: Variable) {
  return new MidFunction(token, string, start, length, result);
}

export function midStatement(
  token: Token,
  variable: Variable,
  startExpr: parser.ExprContext,
  lengthExpr: parser.ExprContext | undefined,
  stringExpr: parser.ExprContext) {
  return new MidStatement(token, variable, startExpr, lengthExpr, stringExpr);
}

export function let_(variable: Variable, expr: parser.ExprContext) {
  return new LetStatement(variable, expr);
}

export function len(variable: Variable | undefined, stringExpr: parser.ExprContext | undefined, result: Variable) {
  return new LenStatement(variable, stringExpr, result);
}

export function line(args: LineStatementArgs) {
  return new LineStatement(args);
}

export function loop(isWhile: boolean, expr: parser.ExprContext) {
  return new LoopTest(isWhile, expr);
}

export function log(args: BuiltinStatementArgs) {
  return new LogFunction(args);
}

export function lpos(args: BuiltinStatementArgs) {
  return new LposFunction(args);
}

export function lsetRecord(dest: Variable, source: Variable) {
  return new LsetRecordStatement(dest, source);
}

export function lsetString(token: Token, variable: Variable, stringExpr: parser.ExprContext) {
  return new LsetStringStatement(token, variable, stringExpr);
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

export function noop() {
  return new NoOpStatement();
}

export function oct(args: BuiltinStatementArgs) {
  return new OctFunction(args);
}

export function open(args: OpenArgs) {
  return new OpenStatement(args);
}

export function paint(args: PaintStatementArgs) {
  return new PaintStatement(args);
}

export function palette(token: Token, attributeExpr?: parser.ExprContext, colorExpr?: parser.ExprContext, array?: Variable) {
  return new PaletteStatement(token, attributeExpr, colorExpr, array);
}

export function peek(args: BuiltinStatementArgs) {
  return new PeekStatement(args);
}

export function pen(args: BuiltinStatementArgs) {
  return new PenFunction(args);
}

export function playFunction(result: Variable) {
  return new PlayFunction(result);
}

export function playStatement(token: Token, commandString: parser.ExprContext) {
  return new PlayStatement(token, commandString);
}

export function pmap(args: BuiltinStatementArgs) {
  return new PmapFunction(args);
}

export function point(args: BuiltinStatementArgs) {
  return new PointFunction(args);
}

export function poke(args: BuiltinStatementArgs) {
  return new PokeStatement(args);
}

export function pos(args: BuiltinStatementArgs) {
  return new PosFunction(args);
}

export function print(args: PrintStatementArgs) {
  return new PrintStatement(args);
}

export function printUsing(args: PrintStatementArgs) {
  return new PrintUsingStatement(args);
}

export function pset(
  token: Token,
  step: boolean,
  x: parser.ExprContext,
  y: parser.ExprContext,
  color?: parser.ExprContext
) {
  return new PsetStatement(token, step, x, y, color);
}

export function preset(
  token: Token,
  step: boolean,
  x: parser.ExprContext,
  y: parser.ExprContext,
  color?: parser.ExprContext
) {
  return new PresetStatement(token, step, x, y, color);
}

export function putIo(
  token: Token,
  fileNumber: parser.ExprContext,
  recordNumber?: parser.ExprContext,
  variable?: Variable
) {
  return new PutIoStatement(token, fileNumber, recordNumber, variable);
}

export function putGraphics(args: PutGraphicsStatementArgs) {
  return new PutGraphicsStatement(args);
}

export function randomize({seed, variable} : {seed?: parser.ExprContext, variable?: Variable}) {
  return new RandomizeStatement(seed, variable);
}

export function read(token: Token, result: Variable) {
  return new ReadStatement(token, result);
}

export function reset(args: BuiltinStatementArgs) {
  return new ResetStatement(args);
}

export function restore() {
  return new RestoreStatement();
}

export function resume({token, next}: {token: Token, next: boolean}) {
  return new ResumeStatement(token, next);
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

export function rnd(args: BuiltinStatementArgs) {
  return new RndFunction(args);
}

export function rsetString(token: Token, variable: Variable, stringExpr: parser.ExprContext) {
  return new RsetStringStatement(token, variable, stringExpr);
}

export function rtrim(args: BuiltinStatementArgs) {
  return new RtrimFunction(args);
}

export function screenFunction(
  token: Token,
  result: Variable,
  rowExpr: parser.ExprContext,
  columnExpr: parser.ExprContext,
  colorFlag?: parser.ExprContext
) {
  return new ScreenFunction(token, result, rowExpr, columnExpr, colorFlag);
}

export function screenStatement(
  token: Token,
  modeExpr: parser.ExprContext,
  colorSwitchExpr?: parser.ExprContext,
  activePageExpr?: parser.ExprContext,
  visiblePageExpr?: parser.ExprContext
) {
  return new ScreenStatement(token, modeExpr, colorSwitchExpr, activePageExpr, visiblePageExpr);
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

export function sleep(args: BuiltinStatementArgs) {
  return new SleepStatement(args);
}

export function sound(args: BuiltinStatementArgs) {
  return new SoundStatement(args);
}

export function sqr(args: BuiltinStatementArgs) {
  return new SqrFunction(args);
}

export function stick(args: BuiltinStatementArgs) {
  return new StickFunction(args);
}

export function stop() {
  return new StopStatement();
}

export function str(args: BuiltinStatementArgs) {
  return new StrFunction(args);
}

export function strig(args: BuiltinStatementArgs) {
  return new StrigFunction(args);
}

export function string(args: BuiltinStatementArgs) {
  return new StringFunction(args);
}

export function space(args: BuiltinStatementArgs) {
  return new SpaceFunction(args);
}

export function swap(a: Variable, b: Variable) {
  return new SwapStatement(a, b);
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

export function varseg(token: Token, result: Variable, variable: Variable, variableSymbol: Variable) {
  return new VarSegFunction(token, result, variable, variableSymbol);
}

export function varptrString(token: Token, result: Variable, variable: Variable, variableSymbol: Variable) {
  return new VarPtrStringFunction(token, result, variable, variableSymbol);
}

export function varptr(token: Token, result: Variable, variable: Variable, variableSymbol: Variable) {
  return new VarPtrFunction(token, result, variable, variableSymbol);
}

export function view_(
  token: Token,
  screen: boolean,
  x1?: parser.ExprContext,
  y1?: parser.ExprContext,
  x2?: parser.ExprContext,
  y2?: parser.ExprContext,
  color?: parser.ExprContext,
  border?: parser.ExprContext,
) {
  return new ViewStatement(token, screen, x1, y1, x2, y2, color, border);
}

export function viewPrint(
  token: Token,
  topRow?: parser.ExprContext,
  bottomRow?: parser.ExprContext,
) {
  return new ViewPrintStatement(token, topRow, bottomRow);
}

export function while_(expr: parser.ExprContext) {
  return new DoTest(true, expr);
}

export function widthFile(token: Token, fileNumber: parser.ExprContext, width: parser.ExprContext) {
  return new WidthFileStatement(token, fileNumber, width);
}

export function widthLprint(token: Token, width: parser.ExprContext) {
  return new WidthLprintStatement(token, width);
}

export function widthScreen(token: Token, columns?: parser.ExprContext, lines?: parser.ExprContext) {
  return new WidthScreenStatement(token, columns, lines);
}

export function window_(
  token: Token,
  screen: boolean,
  x1?: parser.ExprContext,
  y1?: parser.ExprContext,
  x2?: parser.ExprContext,
  y2?: parser.ExprContext,
) {
  return new WindowStatement(token, screen, x1, y1, x2, y2);
}

export function write(args: PrintStatementArgs) {
  return new WriteStatement(args);
}