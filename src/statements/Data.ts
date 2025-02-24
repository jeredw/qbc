import { Token } from "antlr4ng";
import { Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";
import { RuntimeError } from "../Errors.ts";
import { cast, isError, OUT_OF_DATA, string, SYNTAX_ERROR, Value, valueOfNumericType } from "../Values.ts";
import { TypeTag } from "../Types.ts";
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
  token: Token;
  result: Variable;

  constructor(token: Token, result: Variable) {
    super();
    this.token = token;
    this.result = result;
  }

  override execute(context: ExecutionContext) {
    const dataItem = context.data.read();
    if (dataItem === undefined) {
      throw RuntimeError.fromToken(this.token, OUT_OF_DATA);
    }
    let value: Value;
    if (this.result.type.tag == TypeTag.STRING) {
      value = dataItem.text ?
        string(dataItem.quoted ? dataItem.text.slice(1, -1) : dataItem.text) :
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
    const [address, _] = context.memory.dereference(this.result);
    context.memory.write(address, value);
  }
}
