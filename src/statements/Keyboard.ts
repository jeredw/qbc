import { BuiltinStatementArgs } from "../Builtins.ts";
import { Statement } from "./Statement.ts";
import { Variable } from "../Variables.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { string } from "../Values.ts";
import { asciiToString, stringToAscii } from "../AsciiChart.ts";
import { isModifier } from "../ScanCodeChart.ts";
import { ExprContext } from "../../build/QBasicParser.ts";
import { Token } from "antlr4ng";
import { evaluateIntegerExpression, evaluateStringExpression } from "../Expressions.ts";
import { RuntimeError, ILLEGAL_FUNCTION_CALL } from "../Errors.ts";

export class InkeyFunction extends Statement {
  result: Variable;

  constructor({result}: BuiltinStatementArgs) {
    super();
    if (!result) {
      throw new Error("expecting result")
    }
    this.result = result;
  }

  override execute(context: ExecutionContext) {
    const key = context.devices.keyboard.input();
    // Skip break codes for inkey$.
    const output = !key || (key.code & 0x80) || isModifier(key.code) ? string("") :
      key.char ? string(key.char) :
      string(asciiToString([0, key.code]));
    context.memory.write(this.result, output);
  }
}

export enum KeyStatementOperation {
  LIST,
  ON,
  OFF,
  BIND,
}

export interface KeyStatementArgs {
  token: Token;
  operation: KeyStatementOperation;
  keyNumber?: ExprContext;
  stringExpr?: ExprContext;
}

export class KeyStatement extends Statement {
  constructor(private args: KeyStatementArgs) {
    super();
  }

  override execute(context: ExecutionContext) {
    switch (this.args.operation) {
      case KeyStatementOperation.LIST:
        return this.listMacros(context);
      case KeyStatementOperation.ON:
        return this.showSoftKeys(context);
      case KeyStatementOperation.OFF:
        return this.hideSoftKeys(context);
      case KeyStatementOperation.BIND:
        return this.bindKey(context);
    }
  }

  private listMacros(context: ExecutionContext) {
    const {screen, keyboard} = context.devices;
    for (let i = 1; i <= 12; i++) {
      const keyBinding = keyboard.getMacro(i);
      const keyName = `F${i}`.padEnd(4, ' ');
      screen.print(`${keyName}${keyBinding}`, true);
    }
  }

  private showSoftKeys(context: ExecutionContext) {
    context.devices.screen.showSoftKeys();
  }

  private hideSoftKeys(context: ExecutionContext) {
    context.devices.screen.hideSoftKeys();
  }

  private bindKey(context: ExecutionContext) {
    const keyNumber = evaluateIntegerExpression(this.args.keyNumber!, context.memory);
    const text = evaluateStringExpression(this.args.stringExpr!, context.memory).slice(0, 15);
    if (keyNumber >= 1 && keyNumber <= 10) {
      // F1-F10
      context.devices.keyboard.setMacro(keyNumber, text);
      context.devices.screen.setSoftKey(keyNumber, text);
      return;
    }
    if (keyNumber >= 30 && keyNumber <= 31) {
      // F11-F12
      context.devices.keyboard.setMacro(keyNumber - 19, text);
      return;
    }
    if (keyNumber >= 15 && keyNumber <= 25) {
      // User defined keys
      if (text.length !== 2) {
        throw RuntimeError.fromToken(this.args.token, ILLEGAL_FUNCTION_CALL);
      }
      const codes = stringToAscii(text);
      const flags = codes[0];
      const scanCode = codes[1];
      context.devices.keyboard.mapKey(flags, scanCode, keyNumber);
      return;
    }
    // It is illegal to remap any other keys, including arrow keys 11-14.
    throw RuntimeError.fromToken(this.args.token, ILLEGAL_FUNCTION_CALL);
  }
}