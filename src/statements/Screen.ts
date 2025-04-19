import { Token } from "antlr4ng";
import { ExprContext } from "../../build/QBasicParser.ts";
import { Statement } from "./Statement.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { evaluateIntegerExpression } from "../Expressions.ts";
import { ILLEGAL_FUNCTION_CALL, integer, isNumeric, isReference } from "../Values.ts";
import { RuntimeError } from "../Errors.ts";
import { Variable } from "../Variables.ts";
import { readNumbersFromArray } from "./Arrays.ts";
import { BuiltinStatementArgs } from "../Builtins.ts";

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

export class ColorStatement extends Statement {
  constructor(
    private token: Token,
    private arg1?: ExprContext,
    private arg2?: ExprContext,
    private arg3?: ExprContext,
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const {screen} = context.devices;
    const mode = screen.getMode().mode;
    const arg1 = this.arg1 && evaluateIntegerExpression(this.arg1, context.memory);
    const arg2 = this.arg2 && evaluateIntegerExpression(this.arg2, context.memory);
    const arg3 = this.arg3 && evaluateIntegerExpression(this.arg3, context.memory);
    try {
      if (mode === 2) {
        throw new Error('color not allowed in mode 2');
      }
      if ((this.arg1 === undefined &&
           this.arg2 === undefined &&
           this.arg3 === undefined) && (mode === 0 || mode === 11)) {
        throw new Error('color must have an argument in mode 0 and mode 11');
      }
      if (mode === 0) {
        const [fgColor, bgColor, border] = [arg1, arg2, arg3];
        screen.setColor(fgColor, bgColor, border);
        return;
      }
      if (mode === 1) {
        // If specified, arg3 has the same effect as arg2 and takes precedence over it.
        const [bgColor, pal, pal2] = [arg1, arg2, arg3];
        screen.setColor(undefined, bgColor);
        const palette = pal2 ?? pal;
        if (palette !== undefined) {
          if (palette < 0 || palette > 255) {
            throw new Error('bad cga palette argument');
          }
          // Select which set of 4 ugly colors to use.
          if (palette % 2 === 0) {
            screen.setPaletteEntry(1, 2);
            screen.setPaletteEntry(2, 4);
            screen.setPaletteEntry(3, 6);
          } else {
            screen.setPaletteEntry(1, 3);
            screen.setPaletteEntry(2, 5);
            screen.setPaletteEntry(3, 7);
          }
        }
        return;
      }
      if (this.arg3 !== undefined) {
        throw new Error('only modes 0 and 1 support color with 3 arguments');
      }
      const [fgColor, bgColor] = [arg1, arg2];
      if ((bgColor !== undefined) && (mode >= 11 && mode <= 13)) {
        throw new Error('bg color not allowed in modes 11-13');
      }
      screen.setColor(fgColor, bgColor);
    } catch(e: unknown) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
  }
}

export class PaletteStatement extends Statement {
  constructor(
    private token: Token,
    private attributeExpr?: ExprContext,
    private colorExpr?: ExprContext,
    private array?: Variable,
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const {screen} = context.devices;
    const attribute = this.attributeExpr && evaluateIntegerExpression(this.attributeExpr, context.memory);
    const color = this.colorExpr && evaluateIntegerExpression(this.colorExpr, context.memory);
    try {
      if (attribute !== undefined && color !== undefined) {
        screen.setPaletteEntry(attribute, color);
      } else if (this.array) {
        const attributes = screen.getMode().attributes;
        const values = readNumbersFromArray(this.array, attributes, context.memory);
        for (let i = 0; i < values.length; i++) {
          if (values[i] != -1) {
            screen.setPaletteEntry(i, values[i]);
          }
        }
      } else {
        screen.resetPalette();
      }
    } catch (e: unknown) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
  }
}

export class ClsStatement extends Statement {
  constructor(private args: BuiltinStatementArgs) {
    super();
  }

  override execute(context: ExecutionContext) {
    // TODO: viewports
    context.devices.screen.clear();
  }
}

export class CsrlinFunction extends Statement {
  result: Variable;

  constructor({result}: BuiltinStatementArgs) {
    super();
    this.result = result!;
  }

  override execute(context: ExecutionContext) {
    const row = context.devices.screen.getRow();
    context.memory.write(this.result, integer(row));
  }
}

export class PosFunction extends Statement {
  result: Variable;

  constructor({result}: BuiltinStatementArgs) {
    super();
    this.result = result!;
  }

  override execute(context: ExecutionContext) {
    const column = context.devices.screen.getColumn();
    context.memory.write(this.result, integer(column));
  }
}

export class LocateStatement extends Statement {
  constructor(
    private token: Token,
    private rowExpr?: ExprContext,
    private columnExpr?: ExprContext,
    private cursorExpr?: ExprContext,
    private startExpr?: ExprContext,
    private stopExpr?: ExprContext
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const {screen} = context.devices;
    const row = this.rowExpr && evaluateIntegerExpression(this.rowExpr, context.memory);
    const column = this.columnExpr && evaluateIntegerExpression(this.columnExpr, context.memory);
    const cursor = this.cursorExpr && evaluateIntegerExpression(this.cursorExpr, context.memory);
    const start = this.startExpr && evaluateIntegerExpression(this.startExpr, context.memory);
    const stop = this.stopExpr && evaluateIntegerExpression(this.stopExpr, context.memory);
    try {
      if (row !== undefined || column !== undefined) {
        screen.locateCursor(row, column);
      }
      if (cursor === 0) {
        screen.hideCursor();
      } else if (cursor !== undefined && cursor !== 0) {
        screen.showCursor();
      }
      if (start !== undefined && stop !== undefined) {
        screen.configureCursor(start, stop);
      }
    } catch (e: unknown) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
  }
}