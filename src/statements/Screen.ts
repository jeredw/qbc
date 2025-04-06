import { Token } from "antlr4ng";
import { ExprContext } from "../../build/QBasicParser.ts";
import { Statement } from "./Statement.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { evaluateIntegerExpression } from "../Expressions.ts";
import { ILLEGAL_FUNCTION_CALL } from "../Values.ts";
import { RuntimeError } from "../Errors.ts";

export class ScreenStatement extends Statement {
  constructor(
    private token: Token,
    private modeExpr: ExprContext,
    private colorSwitchExpr?: ExprContext,
    private activePageExpr?: ExprContext,
    private visiblePageExpr?: ExprContext
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const mode = evaluateIntegerExpression(this.modeExpr, context.memory);
    const colorSwitch = this.colorSwitchExpr ? evaluateIntegerExpression(this.colorSwitchExpr, context.memory) : 0;
    const activePage = this.activePageExpr ? evaluateIntegerExpression(this.activePageExpr, context.memory) : 0;
    const visiblePage = this.visiblePageExpr ? evaluateIntegerExpression(this.visiblePageExpr, context.memory) : 0;
    try {
      context.devices.screen.configure(mode, colorSwitch, activePage, visiblePage);
    } catch(e: unknown) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
  }
}