import { Token } from "antlr4ng";
import { BuiltinStatementArgs } from "../Builtins.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";
import { ADVANCED_FEATURE_UNAVAILABLE, ILLEGAL_FUNCTION_CALL, OUT_OF_MEMORY, RuntimeError } from "../Errors.ts";
import { ExprContext } from "../../build/QBasicParser.ts";
import { Variable } from "../Variables.ts";
import { evaluateIntegerExpression, evaluateStringExpression } from "../Expressions.ts";
import { string } from "../Values.ts";

// The environment is fixed and we just error if ENVIRON tries to set anything.
const ENVIRONMENT: [string, string][] = [
  ["", ""],
  ["PATH", "C:\\"],
  ["BLASTER", "A220 I7 D1 H5 T6"],
];

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

export class EnvironStatement extends Statement {
  constructor(
    private expr: ExprContext,
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const setting = evaluateStringExpression(this.expr, context.memory);
    if (setting.includes('=')) {
      throw RuntimeError.fromToken(this.startToken!, OUT_OF_MEMORY);
    }
    throw RuntimeError.fromToken(this.startToken!, ILLEGAL_FUNCTION_CALL);
  }
}

export class EnvironFunction extends Statement {
  constructor(
    private result: Variable,
    private stringExpr?: ExprContext,
    private indexExpr?: ExprContext,
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    if (this.indexExpr) {
      const index = evaluateIntegerExpression(this.indexExpr, context.memory);
      if (index < 1 || index > 255) {
        throw RuntimeError.fromToken(this.startToken!, ILLEGAL_FUNCTION_CALL);
      }
      const value = index < ENVIRONMENT.length ? ENVIRONMENT[index][1] : "";
      context.memory.write(this.result, string(value));
      return;
    }
    if (!this.stringExpr) {
      throw new Error('Expecting one of n% or str$ argument for ENVIRON$().');
    }
    const varName = evaluateStringExpression(this.stringExpr, context.memory);
    const entry = ENVIRONMENT.find((setting) => setting[0].toUpperCase() == varName.toUpperCase());
    const value = entry ? entry[1] : "";
    context.memory.write(this.result, string(value));
  }
}