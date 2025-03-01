import { Token } from "antlr4ng";
import { ExprContext } from "../../build/QBasicParser.ts";
import { evaluateExpression, evaluateIntegerExpression } from "../Expressions.ts";
import { TypeTag } from "../Types.ts";
import { isError, isNumeric, isString, NumericValue, TYPE_MISMATCH } from "../Values.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";
import { RuntimeError } from "../Errors.ts";

export interface PrintArgument {
  token: Token;
  expr?: ExprContext;
  spaces?: ExprContext;
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
    let lastSeparator: string | undefined;
    for (const {token, expr, spaces, separator} of this.args) {
      if (spaces) {
        const numSpaces = evaluateIntegerExpression(spaces, context.memory);
        if (numSpaces > 0) {
          // TODO take into account screen width
          screen.print(' '.repeat(numSpaces % 80), false);
        }
      }
      if (expr) {
        const value = evaluateExpression({expr, memory: context.memory});
        if (isNumeric(value)) {
          const formatted = formatNumber(value);
          const padded = formatted.startsWith('-') ? `${formatted} ` : ` ${formatted} `;
          screen.print(padded, false);
        } else if (isString(value)) {
          screen.print(value.string, false);
        } else if (isError(value)) {
          throw RuntimeError.fromToken(token, value);
        } else {
          throw RuntimeError.fromToken(token, TYPE_MISMATCH);
        }
      }
      if (separator == ',') {
        screen.tab();
      }
      lastSeparator = separator;
    }
    if (!lastSeparator) {
      context.devices.textScreen.print('', true);
    }
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