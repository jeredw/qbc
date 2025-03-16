import { Token } from "antlr4ng";
import { ExprContext } from "../../build/QBasicParser.ts";
import { evaluateExpression, evaluateIntegerExpression, evaluateStringExpression } from "../Expressions.ts";
import { TypeTag } from "../Types.ts";
import { ILLEGAL_FUNCTION_CALL, isError, isNumeric, isString, NumericValue, TYPE_MISMATCH } from "../Values.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";
import { RuntimeError } from "../Errors.ts";
import { Printer } from "../Printer.ts";
import { tryIo } from "../Files.ts";
import { getSequentialWriteAccessor } from "./Open.ts";

export interface PrintStatementArgs {
  token: Token;
  printer?: boolean;
  fileNumber?: ExprContext;
  format?: ExprContext;
  exprs: PrintExpr[];
}

export interface PrintExpr {
  token: Token;
  expr?: ExprContext;
  spaces?: ExprContext;
  tab?: ExprContext;
  separator?: string;
}

abstract class BasePrintStatement extends Statement {
  args: PrintStatementArgs;

  constructor(args: PrintStatementArgs) {
    super();
    this.args = args;
  }

  protected getPrinter(context: ExecutionContext): Printer {
    if (this.args.fileNumber) {
      return getSequentialWriteAccessor({
        fileNumber: this.args.fileNumber,
        context
      });
    }
    return this.args.printer ? context.devices.printer : context.devices.textScreen;
  }
}

export class PrintStatement extends BasePrintStatement {
  constructor(args: PrintStatementArgs) {
    super(args);
  }

  override execute(context: ExecutionContext) {
    tryIo(this.args.token, () => this.print(context));
  }

  private print(context: ExecutionContext) {
    const printer = this.getPrinter(context);
    for (let i = 0; i < this.args.exprs.length; i++) {
      const {token, expr, spaces, tab, separator} = this.args.exprs[i];
      const isLastArg = i == this.args.exprs.length - 1;
      const newLine = isLastArg && !separator;
      if (spaces) {
        const numSpaces = evaluateIntegerExpression(spaces, context.memory);
        printer.space(numSpaces);
      }
      if (tab) {
        const column = evaluateIntegerExpression(tab, context.memory);
        printer.tab(column);
      }
      if (expr) {
        const value = evaluateExpression({expr, memory: context.memory});
        if (isNumeric(value)) {
          const formatted = formatNumber(value);
          const padded = formatted.startsWith('-') ? `${formatted} ` : ` ${formatted} `;
          printer.print(padded, newLine);
        } else if (isString(value)) {
          printer.print(value.string, newLine);
        } else if (isError(value)) {
          throw RuntimeError.fromToken(token, value);
        } else {
          throw RuntimeError.fromToken(token, TYPE_MISMATCH);
        }
      }
      if (separator == ',') {
        printer.tab();
      }
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

export class PrintUsingStatement extends BasePrintStatement {
  constructor(args: PrintStatementArgs) {
    super(args);
  }

  override execute(context: ExecutionContext) {
    tryIo(this.args.token, () => this.print(context));
  }

  private print(context: ExecutionContext) {
    const printer = this.getPrinter(context);
    const formatString = evaluateStringExpression(this.args.format!, context.memory);
    const templates = parseFormatString(formatString);
    if (!templates.some((t: Template) => t.type !== TemplateType.LITERAL)) {
      throw RuntimeError.fromToken(this.args.format!.start!, ILLEGAL_FUNCTION_CALL);
    }
    let templateIndex = 0;
    const nextTemplate = () => {
      templateIndex = (templateIndex + 1) % templates.length;
    };
    const isLiteral = () => {
      return templates[templateIndex].type === TemplateType.LITERAL;
    };
    const printLiterals = (newLine: boolean) => {
      const start = templateIndex;
      // Don't wrap back to the start of the template string, so that for
      // instance _!##.##_! does not print !! after a number.
      while (templateIndex >= start && isLiteral()) {
        const template = templates[templateIndex] as LiteralTemplate;
        nextTemplate();
        const isNextLiteral = templateIndex >= start && isLiteral();
        printer.print(template.text, newLine && !isNextLiteral);
      }
    };
    for (let i = 0; i < this.args.exprs.length; i++) {
      const {token, expr, spaces, tab, separator} = this.args.exprs[i];
      const isLastArg = i == this.args.exprs.length - 1;
      const newLine = isLastArg && !separator;
      if (spaces) {
        const numSpaces = evaluateIntegerExpression(spaces, context.memory);
        printer.space(numSpaces);
      }
      if (tab) {
        const column = evaluateIntegerExpression(tab, context.memory);
        printer.tab(column);
      }
      if (expr) {
        const value = evaluateExpression({expr, memory: context.memory});
        if (isNumeric(value)) {
          printLiterals(false);
          const template = templates[templateIndex];
          nextTemplate();
          if (template.type != TemplateType.NUMBER) {
            throw RuntimeError.fromToken(expr.start!, TYPE_MISMATCH);
          }
          const number = value.tag === TypeTag.SINGLE ? 
            parseFloat(value.number.toPrecision(7)) : value.number;
          const formatted = formatUsingNumberTemplate(number, template);
          printer.print(formatted, newLine && !isLiteral());
          printLiterals(newLine);
        } else if (isString(value)) {
          printLiterals(false);
          const template = templates[templateIndex];
          nextTemplate();
          if (template.type !== TemplateType.STRING) {
            throw RuntimeError.fromToken(expr.start!, TYPE_MISMATCH);
          }
          const formatted = formatUsingStringTemplate(value.string, template);
          printer.print(formatted, newLine && !isLiteral());
          printLiterals(newLine);
        } else if (isError(value)) {
          throw RuntimeError.fromToken(token, value);
        } else {
          throw RuntimeError.fromToken(token, TYPE_MISMATCH);
        }
      }
    }
  }
}

enum TemplateType {
  STRING,
  NUMBER,
  LITERAL
}

interface StringTemplate {
  type: TemplateType.STRING;
  length?: number;
}

interface LiteralTemplate {
  type: TemplateType.LITERAL;
  text: string;
}

interface NumberTemplate {
  type: TemplateType.NUMBER;
  signBefore?: boolean;
  signAfter?: boolean;
  minusAfter?: boolean;
  fillWithAsterisks?: boolean;
  dollarSign?: boolean;
  comma?: boolean;
  decimalPoint?: boolean;
  beforeDecimal?: number;
  afterDecimal?: number;
  exponent?: number;
}

type Template =
  | StringTemplate
  | LiteralTemplate
  | NumberTemplate;

function parseFormatString(formatString: String): Template[] {
  const templates: Template[] = [];
  const tokens = formatString.match(/(_.|\\ *\\|#+|\$\$|\*\*\$|\*\*|\^\^\^\^\^|\^\^\^\^|.)/g) || [];
  // decimal-empty : . #* ;
  // decimal-nonempty : . #+ ;
  const decimal = (pos: number, requireHashes?: boolean): [number | null, NumberTemplate | null] => {
    const result: NumberTemplate = {type: TemplateType.NUMBER};
    if (tokens[pos] === '.') {
      result.decimalPoint = true;
      if (tokens[pos + 1] && tokens[pos + 1].startsWith('#')) {
        result.afterDecimal = tokens[pos + 1].length;
        return [pos + 2, result];
      } else if (!requireHashes) {
        result.afterDecimal = 0;
        return [pos + 1, result];
      }
    }
    return [null, null];
  };
  // number : +? ( $$ (#* ,? #*) decimal-empty?
  //             | ** (#* ,? #*) decimal-empty?
  //             | **$ (#* ,? #*) decimal-empty?
  //             | #+ ,? #* decimal-empty?
  //             | decimal-nonempty )
  //          (^^^^ | ^^^^^)?
  //          (+ | -)? ;
  const numberTemplate = (pos: number): [number | null, NumberTemplate | null] => {
    let result: NumberTemplate = {type: TemplateType.NUMBER};
    const matchOptionalHashesAndComma = () => {
      if (tokens[pos] && tokens[pos].startsWith('#')) {
        result.beforeDecimal = tokens[pos].length;
        pos++;
      }
      if (tokens[pos] == ',') {
        result.comma = true;
        pos++;
      }
      if (tokens[pos] && tokens[pos].startsWith('#')) {
        result.beforeDecimal = (result.beforeDecimal || 0) + tokens[pos].length;
        pos++;
      }
    };
    const matchOptionalDecimal = () => {
      const [nextPos, decimalResult] = decimal(pos);
      if (nextPos && decimalResult) {
        result = {...result, ...decimalResult};
        pos = nextPos;
      }
    };
    if (tokens[pos] === '+') {
      result.signBefore = true;
      pos++;
    }
    if (tokens[pos] === '$$' || tokens[pos] === '**' || tokens[pos] === '**$') {
      result.dollarSign = tokens[pos].includes('$');
      result.fillWithAsterisks = tokens[pos].includes('*');
      pos++;
      matchOptionalHashesAndComma();
      matchOptionalDecimal();
    } else if (tokens[pos] && tokens[pos].startsWith('#')) {
      result.beforeDecimal = tokens[pos].length;
      pos++;
      if (tokens[pos] === ',') {
        result.comma = true;
        pos++;
        if (tokens[pos] && tokens[pos].startsWith('#')) {
          result.beforeDecimal += tokens[pos].length;
          pos++;
        }
      }
      matchOptionalDecimal();
    } else {
      const [nextPos, decimalResult] = decimal(pos, true);
      if (!nextPos || !decimalResult) {
        return [null, null];
      }
      result = {...result, ...decimalResult};
      pos = nextPos;
    }
    if (tokens[pos] === '^^^^^') {
      result.exponent = 5;
      pos++;
    } else if (tokens[pos] === '^^^^') {
      result.exponent = 4;
      pos++;
    }
    if (tokens[pos] === '+' && !result.signBefore) {
      result.signAfter = true;
      pos++;
    } else if (tokens[pos] === '-' && !result.signBefore) {
      result.minusAfter = true;
      pos++;
    }
    return [pos, result];
  };
  const stringTemplate = (pos: number): [number | null, StringTemplate | null] => {
    if (tokens[pos] && tokens[pos].startsWith('\\') && tokens[pos].includes(' ')) {
      return [pos + 1, {type: TemplateType.STRING, length: tokens[pos].length}];
    }
    if (tokens[pos] === '!') {
      return [pos + 1, {type: TemplateType.STRING, length: 1}];
    }
    if (tokens[pos] === '&') {
      return [pos + 1, {type: TemplateType.STRING}];
    }
    return [null, null];
  };
  let pos = 0;
  while (tokens[pos]) {
    let [afterNumber, number] = numberTemplate(pos);
    if (afterNumber && number) {
      templates.push(number);
      pos = afterNumber;
      continue
    }
    let [afterString, string] = stringTemplate(pos);
    if (afterString && string) {
      templates.push(string);
      pos = afterString;
      continue;
    }
    if (tokens[pos] && tokens[pos].startsWith('_') && tokens[pos].length == 2) {
      templates.push({type: TemplateType.LITERAL, text: tokens[pos][1]});
      pos++;
      continue;
    }
    templates.push({type: TemplateType.LITERAL, text: tokens[pos]});
    pos++;
  }
  return templates;
}

interface FloatString {
  precision: number;
  digits: string;
  exponent: number;
}

function toFloatString(number: number, precision: number): FloatString {
  if (precision === 0) {
    precision = 1;
  }
  const exponentialForm = number.toExponential(precision - 1);
  const digits = exponentialForm.replace('.', '').replace(/e.*/, '').replace('-', '');
  const exponent = parseInt(exponentialForm.replace(/.*e/, ''), 10);
  return {precision, digits, exponent};
}

function formatUsingNumberTemplate(number: number, template: NumberTemplate): string {
  const charsBeforeDecimal = (template.beforeDecimal || 0) +
    (template.fillWithAsterisks && template.dollarSign ? 3 :
      template.fillWithAsterisks || template.dollarSign ? 2 : 0) +
    (template.comma ? 1 : 0) +
    (template.signBefore ? 1 : 0);
  const charsAfterDecimal = template.afterDecimal || 0;
  const fill = template.fillWithAsterisks ? '*' : ' ';
  if (template.exponent) {
    return formatExponential(number, template, charsBeforeDecimal, charsAfterDecimal, fill);
  }
  return formatFixed(number, template, charsBeforeDecimal, charsAfterDecimal, fill);
}

function formatFixed(number: number, template: NumberTemplate, charsBeforeDecimal: number, charsAfterDecimal: number, fill: string): string {
  let result = "";
  if (template.signBefore) {
    result += number < 0 ? '-' : '+';
  } else if (!template.signAfter && !template.minusAfter) {
    result += number < 0 ? '-' : '';
  }
  result += template.dollarSign ? '$' : '';
  charsBeforeDecimal -= result.length;
  let float = toFloatString(number, charsBeforeDecimal + charsAfterDecimal);
  if (float.exponent < 0) {
    // Integer part is zero.
    if (charsAfterDecimal > 0) {
      if (charsBeforeDecimal > 0) {
        // If there's space, output an explicit zero.  A sign field may silently
        // consume this space instead, e.g. "+.#"; .5 -> +.5
        result += '0';
        charsBeforeDecimal--;
      }
    } else {
      // "#"; -.5 is %-1 but "#"; -.4 is -
      const roundedUnits = parseInt(float.digits[0]) >= 5 ? '1' :
        charsBeforeDecimal > 0 ? '0' : '';
      result += roundedUnits;
      charsBeforeDecimal -= roundedUnits.length;
    }
    if (charsBeforeDecimal < 0) {
      result = '%' + result;
    }
    if (charsBeforeDecimal > 0) {
      result = fill.repeat(charsBeforeDecimal) + result;
    }
    result += template.decimalPoint ? '.' : '';
    if (charsAfterDecimal > 0) {
      // -1 -> .x, -2 -> .0x, -3 -> .00x etc
      const numLeadingZeros = -float.exponent - 1;
      if (numLeadingZeros === charsAfterDecimal) {
        result += '0'.repeat(charsAfterDecimal - 1);
        result += parseInt(float.digits[0]) >= 5 ? '1' : '0';
      } else if (numLeadingZeros > charsAfterDecimal) {
        result += '0'.repeat(charsAfterDecimal);
      } else {
        result += '0'.repeat(numLeadingZeros);
        charsAfterDecimal -= numLeadingZeros;
        result += float.digits.slice(0, charsAfterDecimal);
        const numTrailingZeros = charsAfterDecimal - float.digits.length;
        if (numTrailingZeros > 0) {
          result += '0'.repeat(numTrailingZeros);
        }
      }
    }
  } else {
    // Integer part is nonzero
    const numDigitsBeforeDecimal = float.exponent + 1;
    const rerounded = toFloatString(number, numDigitsBeforeDecimal + charsAfterDecimal);
    if (rerounded.exponent === float.exponent) {
      // So that .999 -> 1.0 remains 1.0 if rounded up
      float = rerounded;
    }
    const intPart = groupDigits(float.digits.slice(0, numDigitsBeforeDecimal), template.comma ? ',' : '');
    result += intPart;
    charsBeforeDecimal -= intPart.length;
    if (charsBeforeDecimal < 0) {
      result = '%' + result;
    }
    if (charsBeforeDecimal > 0) {
      result = fill.repeat(charsBeforeDecimal) + result;
    }
    result += template.decimalPoint ? '.' : '';
    if (charsAfterDecimal > 0) {
      const fractionalPart = float.digits.slice(numDigitsBeforeDecimal, numDigitsBeforeDecimal + charsAfterDecimal);
      result += fractionalPart;
      const numTrailingZeros = charsAfterDecimal - fractionalPart.length;
      if (numTrailingZeros > 0) {
        result += '0'.repeat(numTrailingZeros);
      }
    }
  }
  if (!template.signBefore) {
    if (template.signAfter) {
      result += number < 0 ? '-' : '+';
    } else if (template.minusAfter) {
      result += number < 0 ? '-' : ' ';
    }
  }
  return result;
}

function groupDigits(digitsIn: string, separator: string) {
  let digits = digitsIn.slice();
  let result = "";
  while (digits.length > 0) {
    result = digits.slice(-3) + (result.length ? separator + result : '');
    digits = digits.slice(0, -3);
  }
  return result;
}

function formatExponential(number: number, template: NumberTemplate, charsBeforeDecimal: number, charsAfterDecimal: number, fill: string): string {
  let result = "";
  if (number === 0) {
    // 0 has only one significant figure so can't be left shifted.
    result = (template.signBefore ? '+' : '') + (template.dollarSign ? '$' : '') + '0';
    charsBeforeDecimal -= result.length;
    if (charsBeforeDecimal > 0) {
      result = fill.repeat(charsBeforeDecimal) + result;
      charsBeforeDecimal = 0;
    } else if (charsBeforeDecimal < 0) {
      result = '%' + result;
    }
    result += template.decimalPoint ? '.' : '';
    result += '0'.repeat(charsAfterDecimal);
    result += template.exponent === 4 ? 'E+00' : 'E+000';
    return result;
  }
  if (!template.signBefore && !template.signAfter && !template.minusAfter) {
    if (charsBeforeDecimal === 1 && number >= 0) {
      // Omit leading space if there's no room.  If there's a decimal field,
      // lead with a 0 instead of space.
      result = charsAfterDecimal > 0 ? '0' : '';
    } else {
      result = number < 0 ? '-' : fill;
    }
  } else {
    result = template.signBefore ? (number > 0 ? '+' : '-') : '';
  }
  result += template.dollarSign ? '$' : '';
  charsBeforeDecimal -= result.length;
  if (charsBeforeDecimal <= 0) {
    if (charsAfterDecimal === 0) {
      result = '%' + result;
      charsBeforeDecimal = 1;
    }
  }
  const float = toFloatString(number, charsBeforeDecimal + charsAfterDecimal);
  result += float.digits.slice(0, charsBeforeDecimal);
  result += template.decimalPoint ? '.' : '';
  result += float.digits.slice(charsBeforeDecimal);
  const shiftedExponent = float.exponent - (charsBeforeDecimal - 1);
  const exponentLength = template.exponent === 4 ? 2 : 3;
  const zeroPadded = Math.abs(shiftedExponent).toString().padStart(exponentLength, '0');
  result += 'E' + (shiftedExponent < 0 ? '-' : '+') + zeroPadded;
  result += template.signAfter ? (number < 0 ? '-' : '+') : '';
  result += template.minusAfter ? (number < 0 ? '-' : '') : '';
  return result;
}

function formatUsingStringTemplate(string: string, template: StringTemplate): string {
  if (!template.length) {
    return string;
  }
  if (string.length > template.length) {
    return string.slice(0, template.length);
  }
  return string.padEnd(template.length, ' ');
}