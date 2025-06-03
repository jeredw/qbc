import { Token } from "antlr4ng";
import { ExecutionContext } from "./ExecutionContext.ts";
import { Statement } from "./Statement.ts";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { getErrorForCode, ILLEGAL_FUNCTION_CALL, RuntimeError } from "../Errors.ts";
import { BuiltinStatementArgs } from "../Builtins.ts";
import { Variable } from "../Variables.ts";
import { integer, long, string } from "../Values.ts";
import { ExprContext } from "../../build/QBasicParser.ts";
import { evaluateIntegerExpression } from "../Expressions.ts";

export class ErrorHandlerStatement extends Statement {
  constructor(private token: Token) {
    super();
  }

  override execute(context: ExecutionContext) {
    if (context.errorHandling.active && this.targetIndex === undefined) {
      // ON ERROR GOTO 0 inside an error handler re-throws the error and exits.
      throw RuntimeError.fromToken(this.token, context.errorHandling.error!);
    }
    context.errorHandling.targetIndex = this.targetIndex;
    context.errorHandling.token = this.token;
  }
}

export class ResumeStatement extends Statement {
  constructor(
    public token: Token,
    private next: boolean
  ) {
    super();
  }

  override execute(context: ExecutionContext): ControlFlow {
    return {tag: ControlFlowTag.RESUME, targetIndex: this.targetIndex, next: this.next};
  }
}

export class ErdevFunction extends Statement {
  constructor(private result: Variable) {
    super();
  }

  override execute(context: ExecutionContext) {
    // TODO: Model DOS error codes.
    context.memory.write(this.result, integer(1));
  }
}

export class ErdevStringFunction extends Statement {
  constructor(private result: Variable) {
    super();
  }

  override execute(context: ExecutionContext) {
    // TODO: Model DOS error codes.
    context.memory.write(this.result, string("*6"));
  }
}

export class ErlFunction extends Statement {
  private result: Variable;

  constructor(args: BuiltinStatementArgs) {
    super();
    this.result = args.result!;
  }

  override execute(context: ExecutionContext) {
    const errorLine = context.errorHandling.errorLine ?? 0;
    context.memory.write(this.result, long(errorLine));
  }
}

export class ErrFunction extends Statement {
  private result: Variable;

  constructor(args: BuiltinStatementArgs) {
    super();
    this.result = args.result!;
  }

  override execute(context: ExecutionContext) {
    const errorCode = context.errorHandling.active ? context.errorHandling.error?.errorCode : undefined;
    context.memory.write(this.result, integer(errorCode ?? 0));
  }
}

export class ErrorStatement extends Statement {
  constructor (
    private token: Token,
    private errorCodeExpr: ExprContext
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const errorCode = evaluateIntegerExpression(this.errorCodeExpr, context.memory);
    if (errorCode < 0 || errorCode > 255) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    throw RuntimeError.fromToken(this.token, getErrorForCode(errorCode));
  }
}