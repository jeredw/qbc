import { Token } from "antlr4ng";
import { BuiltinStatementArgs } from "../Builtins.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";
import { ADVANCED_FEATURE_UNAVAILABLE, RuntimeError } from "../Errors.ts";

export class CommandFunction extends Statement {
  private token: Token;

  constructor({token}: BuiltinStatementArgs) {
    super();
    this.token = token;
  }

  override execute(context: ExecutionContext) {
    throw RuntimeError.fromToken(this.token, ADVANCED_FEATURE_UNAVAILABLE);
  }
}