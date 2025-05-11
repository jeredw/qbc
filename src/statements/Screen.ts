import { Token } from "antlr4ng";
import { ExprContext } from "../../build/QBasicParser.ts";
import { Statement } from "./Statement.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { evaluateIntegerExpression } from "../Expressions.ts";
import { double, ILLEGAL_FUNCTION_CALL, integer } from "../Values.ts";
import { RuntimeError } from "../Errors.ts";
import { Variable } from "../Variables.ts";
import { readNumbersFromArray } from "./Arrays.ts";
import { BuiltinParam, BuiltinStatementArgs } from "../Builtins.ts";
import { TypeTag } from "../Types.ts";

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

export interface CircleStatementArgs {
  token: Token;
  step: boolean;
  x: ExprContext;
  y: ExprContext;
  radius: ExprContext;
  color?: ExprContext;
  start?: ExprContext;
  end?: ExprContext;
  aspect?: ExprContext;
}

export class CircleStatement extends Statement {
  constructor(
    private args: CircleStatementArgs
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const step = this.args.step;
    const x = evaluateIntegerExpression(this.args.x, context.memory);
    const y = evaluateIntegerExpression(this.args.y, context.memory);
    const radius = evaluateIntegerExpression(this.args.radius, context.memory);
    const color = this.args.color && evaluateIntegerExpression(this.args.color, context.memory);
    const start = this.args.start && evaluateIntegerExpression(this.args.start, context.memory, { tag: TypeTag.SINGLE });
    const end = this.args.end && evaluateIntegerExpression(this.args.end, context.memory, { tag: TypeTag.SINGLE });
    const aspect = this.args.aspect && evaluateIntegerExpression(this.args.aspect, context.memory, { tag: TypeTag.SINGLE });
    try {
      context.devices.screen.circle({step, x, y, radius, start, end, aspect}, color);
    } catch (e: unknown) {
      throw RuntimeError.fromToken(this.args.token, ILLEGAL_FUNCTION_CALL);
    }
  }
}

export interface LineStatementArgs {
  token: Token;
  x1?: ExprContext;
  y1?: ExprContext;
  step1: boolean;
  x2: ExprContext;
  y2: ExprContext;
  step2: boolean;
  color?: ExprContext;
  outline: boolean;
  fill: boolean; 
  dash?: ExprContext;
}

export class LineStatement extends Statement {
  constructor(
    private args: LineStatementArgs
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const x1 = this.args.x1 && evaluateIntegerExpression(this.args.x1, context.memory);
    const y1 = this.args.y1 && evaluateIntegerExpression(this.args.y1, context.memory);
    const x2 = evaluateIntegerExpression(this.args.x2, context.memory);
    const y2 = evaluateIntegerExpression(this.args.y2, context.memory);
    const color = this.args.color && evaluateIntegerExpression(this.args.color, context.memory);
    const dash = this.args.dash && evaluateIntegerExpression(this.args.dash, context.memory);
    const {step1, step2, outline, fill} = this.args;
    try {
      context.devices.screen.line({x1, y1, step1, x2, y2, step2, outline, fill, dash}, color);
    } catch (e: unknown) {
      throw RuntimeError.fromToken(this.args.token, ILLEGAL_FUNCTION_CALL);
    }
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

export class PsetStatement extends Statement {
  constructor(
    private token: Token,
    private step: boolean,
    private xExpr: ExprContext,
    private yExpr: ExprContext,
    private colorExpr?: ExprContext
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const x = evaluateIntegerExpression(this.xExpr, context.memory);
    const y = evaluateIntegerExpression(this.yExpr, context.memory);
    const color = this.colorExpr && evaluateIntegerExpression(this.colorExpr, context.memory);
    try {
      context.devices.screen.setPixel(x, y, color, this.step);
    } catch (e: unknown) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
  }
}

export interface PaintStatementArgs {
  token: Token;
  step: boolean;
  x: ExprContext;
  y: ExprContext;
  color?: ExprContext;
  borderColor?: ExprContext;
  tile?: ExprContext;
  background?: ExprContext;
}

export class PaintStatement extends Statement {
  constructor(
    private args: PaintStatementArgs
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const step = this.args.step;
    const x = evaluateIntegerExpression(this.args.x, context.memory);
    const y = evaluateIntegerExpression(this.args.y, context.memory);
    const color = this.args.color && evaluateIntegerExpression(this.args.color, context.memory);
    const borderColor = this.args.borderColor && evaluateIntegerExpression(this.args.borderColor, context.memory);
    try {
      context.devices.screen.paint({step, x, y, borderColor}, color);
    } catch (e: unknown) {
      throw RuntimeError.fromToken(this.args.token, ILLEGAL_FUNCTION_CALL);
    }
  }
}

export class PresetStatement extends Statement {
  constructor(
    private token: Token,
    private step: boolean,
    private xExpr: ExprContext,
    private yExpr: ExprContext,
    private colorExpr?: ExprContext
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const x = evaluateIntegerExpression(this.xExpr, context.memory);
    const y = evaluateIntegerExpression(this.yExpr, context.memory);
    const color = this.colorExpr && evaluateIntegerExpression(this.colorExpr, context.memory);
    try {
      context.devices.screen.resetPixel(x, y, color, this.step);
    } catch (e: unknown) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
  }
}

export class ViewStatement extends Statement {
  constructor(
    private token: Token,
    private screen: boolean,
    private x1?: ExprContext,
    private y1?: ExprContext,
    private x2?: ExprContext,
    private y2?: ExprContext,
    private color?: ExprContext,
    private border?: ExprContext
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const x1 = this.x1 && evaluateIntegerExpression(this.x1, context.memory);
    const y1 = this.y1 && evaluateIntegerExpression(this.y1, context.memory);
    const x2 = this.x2 && evaluateIntegerExpression(this.x2, context.memory);
    const y2 = this.y2 && evaluateIntegerExpression(this.y2, context.memory);
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
      context.devices.screen.resetView();
      return;
    }
    const color = this.color && evaluateIntegerExpression(this.color, context.memory);
    const border = this.border && evaluateIntegerExpression(this.border, context.memory);
    try {
      context.devices.screen.setView({x: x1, y: y1}, {x: x2, y: y2}, this.screen, color, border);
    } catch (e: unknown) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
  }
}

export class ViewPrintStatement extends Statement {
  constructor(
    private token: Token,
    private topRow?: ExprContext,
    private bottomRow?: ExprContext,
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    if (!this.topRow || !this.bottomRow) {
      context.devices.screen.resetViewPrint();
      return;
    }
    const topRow = evaluateIntegerExpression(this.topRow, context.memory);
    const bottomRow = evaluateIntegerExpression(this.bottomRow, context.memory);
    try {
      context.devices.screen.setViewPrint(topRow, bottomRow);
    } catch (e: unknown) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
  }
}

export class WindowStatement extends Statement {
  constructor(
    private token: Token,
    private screen: boolean,
    private x1?: ExprContext,
    private y1?: ExprContext,
    private x2?: ExprContext,
    private y2?: ExprContext,
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const x1 = this.x1 && evaluateIntegerExpression(this.x1, context.memory);
    const y1 = this.y1 && evaluateIntegerExpression(this.y1, context.memory);
    const x2 = this.x2 && evaluateIntegerExpression(this.x2, context.memory);
    const y2 = this.y2 && evaluateIntegerExpression(this.y2, context.memory);
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
      context.devices.screen.resetWindow();
      return;
    }
    try {
      context.devices.screen.setWindow({x: x1, y: y1}, {x: x2, y: y2}, this.screen);
    } catch (e: unknown) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
  }
}

export class WidthScreenStatement extends Statement {
  constructor(
    private token: Token,
    private columns?: ExprContext,
    private lines?: ExprContext
  ) {
    super();
  }

  override execute(context: ExecutionContext) {
    const columns = this.columns && evaluateIntegerExpression(this.columns, context.memory);
    const lines = this.lines && evaluateIntegerExpression(this.lines, context.memory);
    try {
      context.devices.screen.setTextGeometry(columns, lines);
    } catch (e: unknown) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
  }
}

export class PointFunction extends Statement {
  token: Token;
  params: BuiltinParam[];
  arg1: ExprContext;
  y?: ExprContext;
  result: Variable;

  constructor({token, params, result}: BuiltinStatementArgs) {
    super();
    this.token = token;
    if (!params[0].expr) {
      throw new Error('expecting one argument');
    }
    this.arg1 = params[0].expr;
    this.y = params[1].expr;
    if (!result) {
      throw new Error("expecting result");
    }
    this.result = result;
  }

  override execute(context: ExecutionContext) {
    const arg1 = evaluateIntegerExpression(this.arg1, context.memory, { tag: TypeTag.INTEGER });
    const y = this.y && evaluateIntegerExpression(this.y, context.memory, { tag: TypeTag.INTEGER });
    if (y === undefined) {
      const value = this.getCursor(arg1, context);
      context.memory.write(this.result, double(value));
      return;
    }
    try {
      const x = arg1;
      const value = context.devices.screen.getPixel(x, y);
      context.memory.write(this.result, integer(value));
    } catch (e: unknown) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
  }

  private getCursor(n: number, context: ExecutionContext): number {
    const {screen} = context.devices;
    const cursor = screen.getGraphicsCursor();
    try {
      switch (n) {
        case 0: return screen.windowToView({x: cursor.x, y: 0}).x;
        case 1: return screen.windowToView({x: 0, y: cursor.y}).y;
        case 2: return cursor.x;
        case 3: return cursor.y
      }
    } catch (e: unknown) {
      // Fallthrough.
    }
    throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
  }
}

export class PmapFunction extends Statement {
  token: Token;
  params: BuiltinParam[];
  coordinate: ExprContext;
  n: ExprContext;
  result: Variable;

  constructor({token, params, result}: BuiltinStatementArgs) {
    super();
    this.token = token;
    if (params.length != 2) {
      throw new Error("expecting two arguments");
    }
    if (!params[0].expr || !params[1].expr) {
      throw new Error("expecting expr arguments");
    }
    this.coordinate = params[0].expr;
    this.n = params[1].expr;
    if (!result) {
      throw new Error("expecting result");
    }
    this.result = result;
  }

  override execute(context: ExecutionContext) {
    const coordinate = evaluateIntegerExpression(this.coordinate, context.memory, { tag: TypeTag.DOUBLE });
    const value = this.transform(coordinate, context);
    context.memory.write(this.result, double(value));
  }

  private transform(coordinate: number, context: ExecutionContext): number {
    const {screen} = context.devices;
    const n = evaluateIntegerExpression(this.n, context.memory);
    try {
      switch (n) {
        case 0: return screen.windowToView({x: coordinate, y: 0}).x;
        case 1: return screen.windowToView({x: 0, y: coordinate}).y;
        case 2: return screen.viewToWindow({x: coordinate, y: 0}).x;
        case 3: return screen.viewToWindow({x: 0, y: coordinate}).y;
      }
    } catch (e: unknown) {
      // Fallthrough.
    }
    throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
  }
}