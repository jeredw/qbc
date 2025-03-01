import { Token } from "antlr4ng";
import { ExprContext } from "../../build/QBasicParser.ts";
import { evaluateExpression, evaluateIntegerExpression, evaluateStringExpression } from "../Expressions.ts";
import { TypeTag } from "../Types.ts";
import { isError, isNumeric, isString, NumericValue, TYPE_MISMATCH } from "../Values.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";
import { RuntimeError } from "../Errors.ts";

export interface PrintArgument {
  token: Token;
  expr?: ExprContext;
  spaces?: ExprContext;
  tab?: ExprContext;
  separator?: string;
}

export class PrintStatement extends Statement {
  args: PrintArgument[];

  constructor(args: PrintArgument[]) {
    super();
    this.args = args;
  }

  override execute(context: ExecutionContext) {
    const screen = context.devices.textScreen;
    for (let i = 0; i < this.args.length; i++) {
      const {token, expr, spaces, tab, separator} = this.args[i];
      const isLastArg = i == this.args.length - 1;
      const newLine = isLastArg && !separator;
      if (spaces) {
        const numSpaces = evaluateIntegerExpression(spaces, context.memory);
        screen.space(numSpaces);
      }
      if (tab) {
        const column = evaluateIntegerExpression(tab, context.memory);
        screen.tab(column);
      }
      if (expr) {
        const value = evaluateExpression({expr, memory: context.memory});
        if (isNumeric(value)) {
          const formatted = formatNumber(value);
          const padded = formatted.startsWith('-') ? `${formatted} ` : ` ${formatted} `;
          screen.print(padded, newLine);
        } else if (isString(value)) {
          screen.print(value.string, newLine);
        } else if (isError(value)) {
          throw RuntimeError.fromToken(token, value);
        } else {
          throw RuntimeError.fromToken(token, TYPE_MISMATCH);
        }
      }
      if (separator == ',') {
        screen.tab();
      }
    }
  }
}

export class PrintUsingStatement extends Statement {
  format: ExprContext;
  args: PrintArgument[];

  constructor(format: ExprContext, args: PrintArgument[]) {
    super();
    this.format = format;
    this.args = args;
  }

  override execute(context: ExecutionContext) {
    throw new Error("unimplemented");
  }
}

function formatNumber(value: NumericValue): string {
  if (value.tag == TypeTag.SINGLE) {
    // fround() will round this to some long double, so round it back to
    // the likeliest float32.
    const float32 = parseFloat(value.number.toPrecision(7));
    return formatFloat(float32, 7, 'E');
  }
  if (value.tag == TypeTag.DOUBLE) {
    return formatFloat(value.number, 16, 'D');
  }
  return value.number.toString();
}

function formatFloat(number: number, precision: number, exponentChar: string): string {
  if (number === 0) {
    return '0';
  }
  const intPart = Math.trunc(Math.abs(number));
  const intDigits = intPart === 0 ? 0 : Math.trunc(Math.abs(number)).toString().length;
  if (intDigits > precision) {
    return number.toExponential(precision - 1)
      .replace(/\.?0*e/, exponentChar)
      .replace(/([-+])([0-9])$/, '$10$2')
      .replace(`${exponentChar}+00`, '');
  }
  const fixed = number.toFixed(precision - intDigits);
  if (!fixed.includes('e') && parseFloat(fixed) === number) {
    return fixed.replace(/^0*/, '').replace(/\.?0*$/, '');
  }
  return number.toExponential(precision - 1)
    .replace(/\.?0*e/, exponentChar)
    .replace(/([-+])([0-9])$/, '$10$2')
    .replace(`${exponentChar}+00`, '');
}