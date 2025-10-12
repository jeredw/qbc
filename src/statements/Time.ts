import { Token } from "antlr4ng";
import { single, string } from "../Values.ts";
import { Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";
import { evaluateStringExpression, Expression } from "../Expressions.ts";
import { RuntimeError, ILLEGAL_FUNCTION_CALL } from "../Errors.ts";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { sleep } from "../Timer.ts";
import { BuiltinStatementArgs } from "../Builtins.ts";

export class DateFunction extends Statement {
  constructor(private result: Variable) {
    super();
  }

  override execute(context: ExecutionContext) {
    const date = context.devices.timer.date();
    context.memory.write(this.result, string(date));
  }
}

export class DateStatement extends Statement {
  constructor(private token: Token, private expr: Expression) {
    super();
  }

  override execute(context: ExecutionContext) {
    const date = evaluateStringExpression(this.expr, context.memory);
    const match = date.match(/^(\d+)[-/](\d+)[-/](\d+)$/);
    if (!match) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    const [, monthString, dateOfMonthString, yearString] = match;
    const [month, dateOfMonth, year] = [+monthString, +dateOfMonthString, +yearString];
    if (year < 80) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    const fullYear = year < 100 ? year + 1900 : year;
    if (!isValidDosDate(month, dateOfMonth, fullYear)) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    context.devices.timer.setDate(month, dateOfMonth, fullYear);
  }
}

function isLeapYear(fullYear: number): boolean {
  return (fullYear % 4 === 0) && (!(fullYear % 100 === 0) || (fullYear % 400 === 0));
}

function daysInMonth(month: number, fullYear: number): number {
  return month === 2 ?
    28 + (isLeapYear(fullYear) ? 1 : 0) :
    [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
}

function isValidDosDate(month: number, dateOfMonth: number, fullYear: number): boolean {
  if (month < 1 || month > 12) {
    return false;
  }
  if (fullYear < 1980 || fullYear > 2099) {
    return false;
  }
  if (dateOfMonth < 1 || dateOfMonth > daysInMonth(month, fullYear)) {
    return false;
  }
  return true;
}

export class TimeFunction extends Statement {
  constructor(private result: Variable) {
    super();
  }

  override execute(context: ExecutionContext) {
    const time = context.devices.timer.time();
    context.memory.write(this.result, string(time));
  }
}

export class TimeStatement extends Statement {
  constructor(private token: Token, private expr: Expression) {
    super();
  }

  override execute(context: ExecutionContext) {
    const time = evaluateStringExpression(this.expr, context.memory);
    const match = parseTime(time);
    if (!match) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    const [hours, minutes, seconds] = match;
    if (!isValidTime(hours, minutes, seconds)) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    context.devices.timer.setTime(hours, minutes, seconds);
  }
}

function parseTime(time: string): [hours: number, minutes: number, seconds: number] | undefined {
  // The "hh" format in the manual doesn't work.  For "hh:mm", minutes must be
  // specified with a leading 0.
  const hhmm = time.match(/^(\d{1,2}):(0\d|[1-5]\d)$/);
  if (hhmm) {
    const [, hours, minutes] = hhmm;
    return [+hours, +minutes, 0];
  }
  // "hh:mm:ss" may omit leading zeros in any field.
  const hhmmss = time.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
  if (hhmmss) {
    const [, hours, minutes, seconds] = hhmmss;
    return [+hours, +minutes, +seconds];
  }
}

function isValidTime(hours: number, minutes: number, seconds: number): boolean {
  if (hours < 0 || hours > 23) {
    return false;
  }
  if (minutes < 0 || minutes > 59) {
    return false;
  }
  if (seconds < 0 || seconds > 59) {
    return false;
  }
  return true;
}

export class TimerFunction extends Statement {
  static calls = 0;

  constructor(private result: Variable) {
    super();
  }

  override execute(context: ExecutionContext): ControlFlow | void {
    const timestamp = context.devices.timer.timer();
    context.memory.write(this.result, single(timestamp));
    if (context.devices.keyboard.getFrameLock()) {
      // HACK: The TIMER function itself is pretty slow and takes around 1-2ms.
      // Many programs use it in loops to calibrate "CPU speed", like GORILLA.BAS:
      //
      // 'CalcDelay:
      // '  Checks speed of the machine.
      // FUNCTION CalcDelay!
      //   s! = TIMER
      //   DO
      //     i! = i! + 1
      //   LOOP UNTIL TIMER - s! >= .5
      //   CalcDelay! = i!
      // END FUNCTION
      //
      // setTimeout() doesn't really have enough precision so just slow down every
      // nth timer call.
      TimerFunction.calls++;
      if (TimerFunction.calls % 4 === 0) {
        return {tag: ControlFlowTag.WAIT, promise: sleep(0)};
      }
    }
  }
}

export class WaitStatement extends Statement {
  static calls = 0;

  constructor(args: BuiltinStatementArgs) {
    super();
  }

  override execute(context: ExecutionContext): ControlFlow | void {
    if (context.devices.keyboard.getFrameLock()) {
      // HACK: WAIT is almost always used to sync with vertical retrace, to
      // slow down programs that are too fast.  So instead of treating it as a
      // real I/O statement, just wait for a while...
      WaitStatement.calls++;
      if (WaitStatement.calls % 4 === 0) {
        return {tag: ControlFlowTag.WAIT, promise: sleep(0)};
      }
    }
  }
}