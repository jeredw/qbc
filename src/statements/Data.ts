import { Token } from "antlr4ng";
import { Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";
import { RuntimeError, OUT_OF_DATA, SYNTAX_ERROR } from "../Errors.ts";
import { cast, isError, string, Value, valueOfNumericType } from "../Values.ts";
import { isString } from "../Types.ts";
import { parseNumberFromString } from "../Expressions.ts";

export class RestoreStatement extends Statement {
  // Set when resolving targets (after statement constructor).
  dataIndex: number = 0;

  constructor() {
    super();
  }

  override execute(context: ExecutionContext) {
    context.data.restore(this.dataIndex);
  }
}

export class ReadStatement extends Statement {
  constructor(private token: Token, private result: Variable) {
    super();
  }

  override execute(context: ExecutionContext) {
    const dataItem = context.data.read();
    if (dataItem === undefined) {
      throw RuntimeError.fromToken(this.token, OUT_OF_DATA);
    }
    let value: Value;
    if (isString(this.result.type)) {
      value = dataItem.text ?
        string(dataItem.quoted ? trimQuotes(dataItem.text) : dataItem.text) :
        string('');
    } else {
      if (dataItem.quoted) {
        throw RuntimeError.fromToken(this.token, SYNTAX_ERROR);
      }
      const number = dataItem.text ?
        parseNumberFromString(dataItem.text) :
        valueOfNumericType(this.result.type.tag)(0);
      if (!number) {
        throw RuntimeError.fromToken(this.token, SYNTAX_ERROR);
      }
      value = number;
    }
    value = cast(value, this.result.type);
    if (isError(value)) {
      throw RuntimeError.fromToken(this.token, value);
    }
    context.memory.write(this.result, value);
  }
}

function trimQuotes(item: string): string {
  if (item.startsWith('"') && item.endsWith('"')) {
    return item.slice(1, -1);
  }
  if (item.startsWith('"')) {
    return item.slice(1);
  }
  return item;
}