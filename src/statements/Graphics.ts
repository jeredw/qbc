import { Token } from "antlr4ng";
import { ExprContext } from "../../build/QBasicParser.ts";
import { Statement } from "./Statement.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { evaluateIntegerExpression, evaluateStringExpression } from "../Expressions.ts";
import { double, integer, isNumeric, isString } from "../Values.ts";
import { RuntimeError, ILLEGAL_FUNCTION_CALL, OUT_OF_STACK_SPACE } from "../Errors.ts";
import { Variable } from "../Variables.ts";
import { readBytesFromArray, readNumbersFromArray, writeBytesToArray } from "./Arrays.ts";
import { BuiltinParam, BuiltinStatementArgs } from "../Builtins.ts";
import { TypeTag } from "../Types.ts";
import { BlitOperation } from "../Drawing.ts";
import { stringToAscii } from "../AsciiChart.ts";

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
    const color = this.colorExpr && evaluateIntegerExpression(this.colorExpr, context.memory, { tag: TypeTag.LONG });
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
  token: Token;
  optionsExpr?: ExprContext;

  constructor(private args: BuiltinStatementArgs) {
    super();
    this.token = this.args.token;
    this.optionsExpr = this.args.params[0].expr;
  }

  override execute(context: ExecutionContext) {
    let options = this.optionsExpr && evaluateIntegerExpression(this.optionsExpr, context.memory);
    if (options === -1) {
      options = undefined;
    }
    if (options !== undefined && (options < 0 || options > 2)) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    context.devices.screen.clear(options);
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
    const x = evaluateIntegerExpression(this.args.x, context.memory, { tag: TypeTag.SINGLE });
    const y = evaluateIntegerExpression(this.args.y, context.memory, { tag: TypeTag.SINGLE });
    const radius = evaluateIntegerExpression(this.args.radius, context.memory, { tag: TypeTag.SINGLE });
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
  step1: boolean;
  x1?: ExprContext;
  y1?: ExprContext;
  step2: boolean;
  x2: ExprContext;
  y2: ExprContext;
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
    const x1 = this.args.x1 && evaluateIntegerExpression(this.args.x1, context.memory, { tag: TypeTag.SINGLE });
    const y1 = this.args.y1 && evaluateIntegerExpression(this.args.y1, context.memory, { tag: TypeTag.SINGLE });
    const x2 = evaluateIntegerExpression(this.args.x2, context.memory, { tag: TypeTag.SINGLE });
    const y2 = evaluateIntegerExpression(this.args.y2, context.memory, { tag: TypeTag.SINGLE });
    const color = this.args.color && evaluateIntegerExpression(this.args.color, context.memory);
    const dash = this.args.dash && evaluateIntegerExpression(this.args.dash, context.memory);
    const {step1, step2, outline, fill} = this.args;
    try {
      context.devices.screen.line({step1, x1, y1, step2, x2, y2, outline, fill, dash}, color);
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
    const x = evaluateIntegerExpression(this.xExpr, context.memory, { tag: TypeTag.SINGLE });
    const y = evaluateIntegerExpression(this.yExpr, context.memory, { tag: TypeTag.SINGLE });
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
    const x = evaluateIntegerExpression(this.args.x, context.memory, { tag: TypeTag.SINGLE });
    const y = evaluateIntegerExpression(this.args.y, context.memory, { tag: TypeTag.SINGLE });
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
    const x = evaluateIntegerExpression(this.xExpr, context.memory, { tag: TypeTag.SINGLE });
    const y = evaluateIntegerExpression(this.yExpr, context.memory, { tag: TypeTag.SINGLE });
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
    const x1 = this.x1 && evaluateIntegerExpression(this.x1, context.memory, { tag: TypeTag.SINGLE });
    const y1 = this.y1 && evaluateIntegerExpression(this.y1, context.memory, { tag: TypeTag.SINGLE });
    const x2 = this.x2 && evaluateIntegerExpression(this.x2, context.memory, { tag: TypeTag.SINGLE });
    const y2 = this.y2 && evaluateIntegerExpression(this.y2, context.memory, { tag: TypeTag.SINGLE });
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
    const x1 = this.x1 && evaluateIntegerExpression(this.x1, context.memory, { tag: TypeTag.SINGLE });
    const y1 = this.y1 && evaluateIntegerExpression(this.y1, context.memory, { tag: TypeTag.SINGLE });
    const x2 = this.x2 && evaluateIntegerExpression(this.x2, context.memory, { tag: TypeTag.SINGLE });
    const y2 = this.y2 && evaluateIntegerExpression(this.y2, context.memory, { tag: TypeTag.SINGLE });
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

export interface GetGraphicsStatementArgs {
  token: Token;
  step1: boolean;
  x1: ExprContext;
  y1: ExprContext;
  step2: boolean;
  x2: ExprContext;
  y2: ExprContext;
  array: Variable;
}

export class GetGraphicsStatement extends Statement {
  constructor(private args: GetGraphicsStatementArgs) {
    super()
  }

  override execute(context: ExecutionContext) {
    try {
      const step1 = this.args.step1;
      const x1 = evaluateIntegerExpression(this.args.x1, context.memory, { tag: TypeTag.SINGLE });
      const y1 = evaluateIntegerExpression(this.args.y1, context.memory, { tag: TypeTag.SINGLE });
      const step2 = this.args.step2;
      const x2 = evaluateIntegerExpression(this.args.x2, context.memory, { tag: TypeTag.SINGLE });
      const y2 = evaluateIntegerExpression(this.args.y2, context.memory, { tag: TypeTag.SINGLE });
      const buffer = context.devices.screen.getBitmap({x1, y1, step1, x2, y2, step2});
      writeBytesToArray(this.args.array, buffer, context.memory);
    } catch (e: unknown) {
      throw RuntimeError.fromToken(this.args.token, ILLEGAL_FUNCTION_CALL);
    }
  }
}

export interface PutGraphicsStatementArgs {
  token: Token;
  step: boolean;
  x1: ExprContext;
  y1: ExprContext;
  array: Variable;
  preset?: boolean;
  and?: boolean;
  or?: boolean;
  xor?: boolean;
}

export class PutGraphicsStatement extends Statement {
  constructor(private args: PutGraphicsStatementArgs) {
    super()
  }

  override execute(context: ExecutionContext) {
    try {
      const step = this.args.step;
      const x1 = evaluateIntegerExpression(this.args.x1, context.memory, { tag: TypeTag.SINGLE });
      const y1 = evaluateIntegerExpression(this.args.y1, context.memory, { tag: TypeTag.SINGLE });
      const buffer = readBytesFromArray(this.args.array, context.memory);
      const operation = (
        this.args.preset ? BlitOperation.PRESET :
        this.args.and ? BlitOperation.AND :
        this.args.or ? BlitOperation.OR :
        this.args.xor ? BlitOperation.XOR :
        BlitOperation.PSET
      );
      context.devices.screen.putBitmap({x1, y1, step, operation, buffer});
    } catch (e: unknown) {
      throw RuntimeError.fromToken(this.args.token, ILLEGAL_FUNCTION_CALL);
    }
  }
}

export class DrawStatement extends Statement {
  token: Token;
  commandStringExpr: ExprContext;

  constructor(private args: BuiltinStatementArgs) {
    super();
    this.token = args.token;
    this.commandStringExpr = this.args.params[0].expr!;
  }

  override execute(context: ExecutionContext) {
    const {screen} = context.devices;
    const modeInfo = screen.getMode();
    if (modeInfo.mode === 0) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    const commandString = evaluateStringExpression(this.commandStringExpr, context.memory);
    this.draw(commandString, context);
  }

  private draw(commandString: string, context: ExecutionContext, depth = 0) {
    if (depth > 200) {
      throw RuntimeError.fromToken(this.token, OUT_OF_STACK_SPACE);
    }
    const {screen} = context.devices;
    const modeInfo = screen.getMode();
    const aspectScale = (modeInfo.geometry[0].dots[0] / modeInfo.geometry[0].dots[1]) / (4 / 3);
    try {
      const program = parseDrawCommandString(commandString);
      let outOfRange = false;
      const state = screen.getDrawState();
      let cursor = screen.windowToScreen(screen.getGraphicsCursor());
      const move = (move: MoveCommand) => {
        const x = move.direction[0] * this.readNumber(move.amountX, context);
        const y = move.direction[1] * this.readNumber(move.amountY, context);
        const dx = state.scale * x / 4;
        const dy = state.scale * y / 4;
        const target = move.relative ? {
          x: cursor.x + state.matrix[0][0] * dx + state.matrix[0][1] * dy,
          y: cursor.y + state.matrix[1][0] * dx + state.matrix[1][1] * dy
        } : {x, y};
        const deltasTooBig = Math.abs(x) >= 10000 || Math.abs(y) >= 10000;
        if (!move.relative && deltasTooBig) {
          // Error on an absolute move with deltas that are too big.
          throw new Error('move out of range');
        }
        if (deltasTooBig) {
          outOfRange = true;
        }
        if (!move.noPlot) {
          const p1 = screen.screenToWindow(cursor);
          const p2 = screen.screenToWindow({
            x: wrap16Bit(Math.round(target.x)),
            y: wrap16Bit(Math.round(target.y))
          });
          screen.line({
            step1: false,
            x1: p1.x,
            y1: p1.y,
            step2: false,
            x2: p2.x,
            y2: p2.y,
            outline: false,
            fill: false
          });
        }
        if (!move.comeBack) {
          cursor = {...target};
        }
      };
      for (const command of program.commands) {
        if (outOfRange) {
          // Error on any command after an out of range relative move.
          throw new Error('position out of range');
        }
        if (command.move) {
          move(command.move);
        } else if (command.setScale) {
          state.scale = this.readNumber(command.setScale, context);
        } else if (command.turnAngle) {
          const angle = this.readNumber(command.turnAngle, context);
          if (angle < -360 || angle > 360) {
            throw new Error('invalid angle');
          }
          const radians = -angle * Math.PI / 180;
          state.matrix[0][0] = Math.cos(radians);
          state.matrix[0][1] = -Math.sin(radians);
          state.matrix[1][0] = Math.sin(radians) / aspectScale;
          state.matrix[1][1] = Math.cos(radians) / aspectScale;
        } else if (command.setAngle) {
          const angle = this.readNumber(command.setAngle, context);
          if (angle < 0 || angle > 3) {
            throw new Error('invalid angle');
          }
          const radians = -(90 * angle) * Math.PI / 180;
          state.matrix[0][0] = Math.cos(radians);
          state.matrix[0][1] = -Math.sin(radians);
          state.matrix[1][0] = Math.sin(radians);
          state.matrix[1][1] = Math.cos(radians);
          if (angle === 1 || angle === 3) {
            state.matrix[0][0] *= 1/aspectScale;
            state.matrix[0][1] *= aspectScale;
            state.matrix[1][0] *= 1/aspectScale;
            state.matrix[1][1] *= aspectScale;
          }
        } else if (command.paint) {
          const paintColor = this.readNumber(command.paint.paintColor, context);
          const borderColor = this.readNumber(command.paint.borderColor, context);
          const p = screen.screenToWindow(cursor);
          screen.paint({step: false, x: p.x, y: p.y, borderColor}, paintColor);
        } else if (command.setColor) {
          // The color command affects the line color with no validation.
          // Since COLOR controls the background in mode 1 and validates, we
          // need a special accessor just to set the foreground color for
          // drawing.
          screen.setFgColor(this.readNumber(command.setColor, context));
        } else if (command.execute) {
          // s$ = "r1 d1 x": s$ = s$ + varptr$(s$): draw s$
          // draws a diagonal squiggle and then fails with "Out of stack space".
          // So draw evaluation is lazy, and we only parse new commands when we
          // get to an X command.
          if (!command.execute.pointer) {
            throw new Error('expecting string pointer');
          }
          const address = context.memory.readPointer(command.execute.pointer);
          const xString = context.memory.readAddress(address);
          if (!xString) {
            continue;
          }
          if (!isString(xString)) {
            throw new Error('expecting command string');
          }
          this.draw(xString.string, context, depth + 1);
        }
      }
      screen.setDrawState(state);
      screen.setGraphicsCursor(screen.screenToWindow(cursor));
    } catch (e: unknown) {
      if (e instanceof RuntimeError) {
        throw e;
      }
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
  }

  private readNumber(value: DrawValue | undefined, context: ExecutionContext): number {
    if (!value) {
      return 0;
    }
    if (value.pointer) {
      const address = context.memory.readPointer(value.pointer);
      const target = context.memory.readAddress(address);
      if (!target) {
        return 0;
      }
      if (!isNumeric(target)) {
        throw new Error('invalid value');
      }
      return target.number;
    }
    return value.literal ?? 0;
  }
}

interface DrawValue {
  literal?: number;
  pointer?: number;
  hasSign?: boolean;
}

interface PaintCommand {
  paintColor?: DrawValue;
  borderColor?: DrawValue;
}

interface MoveCommand {
  noPlot?: boolean;
  comeBack?: boolean;
  relative?: boolean;
  amountX?: DrawValue;
  amountY?: DrawValue;
  direction: number[];
}

interface DrawCommand {
  move?: MoveCommand;
  setAngle?: DrawValue;
  turnAngle?: DrawValue;
  setColor?: DrawValue;
  setScale?: DrawValue;
  paint?: PaintCommand;
  execute?: DrawValue;
}

interface DrawProgram {
  commands: DrawCommand[];
}

function parseDrawCommandString(commandString: string): DrawProgram {
  const s = commandString.replaceAll(/\s/g, '').toLowerCase();
  let pos = 0;
  const atEnd = () => {
    return pos >= s.length;
  };
  const peek = (): string => {
    if (atEnd()) {
      throw new Error('peek past end of string');
    }
    return s.charAt(pos);
  };
  const advance = (n = 1): string => {
    if (pos + n > s.length) {
      throw new Error("past end of command string");
    }
    const token = s.slice(pos, pos + n);
    pos += n;
    return token;
  };
  const pointerValue = (): DrawValue => {
    const address = advance(4);
    const bytes = stringToAscii(address);
    return {pointer: bytes[0] + (bytes[1] << 8) + (bytes[2] << 16) + (bytes[3] << 24)};
  };
  const value = (): DrawValue => {
    if (peek() === '=') {
      advance();
      return pointerValue();
    }
    let hasSign: boolean | undefined;
    let sign = 1;
    if (peek() === '-' || peek() === '+') {
      hasSign = true;
      sign = peek() === '-' ? -1 : 1;
      advance();
    }
    let literal = 0;
    for (let i = 0; i < 6; i++) {
      if (atEnd() || (peek() < '0' || peek() > '9')) {
        if (i === 0) {
          throw new Error('expecting literal');
        }
        literal *= sign;
        return {literal, hasSign};
      }
      const digit: number = +advance();
      literal = 10 * literal + digit;
    }
    throw new Error('literal too long');
  };
  let noPlot = false;
  let comeBack = false;
  const command = (char: string): DrawCommand => {
    const diagonal = (amount: DrawValue, direction: number[]) => (
      {move: {noPlot, comeBack, relative: true, amountX: amount, amountY: amount, direction}}
    );
    const horizontal = (amount: DrawValue, direction: number[]) => (
      {move: {noPlot, comeBack, relative: true, amountX: amount, direction}}
    );
    const vertical = (amount: DrawValue, direction: number[]) => (
      {move: {noPlot, comeBack, relative: true, amountY: amount, direction}}
    );
    switch (char) {
      case 'u':
        return vertical(value(), [0, -1]);
      case 'd':
        return vertical(value(), [0, 1]);
      case 'l':
        return horizontal(value(), [-1, 0]);
      case 'r':
        return horizontal(value(), [1, 0]);
      case 'e':
        return diagonal(value(), [1, -1]);
      case 'f':
        return diagonal(value(), [1, 1]);
      case 'g':
        return diagonal(value(), [-1, 1]);
      case 'h':
        return diagonal(value(), [-1, -1]);
      case 'm': {
        const amountX = value();
        const relative = amountX.hasSign;
        if (advance() !== ',') {
          throw new Error('expecting comma');
        }
        const amountY = value();
        const direction = [1, 1];
        return {move: {noPlot, comeBack, relative, amountX, amountY, direction}};
      }
      case 'a':
        return {setAngle: value()};
      case 't':
        if (advance() !== 'a') {
          throw new Error('expecting a for ta');
        }
        return {turnAngle: value()};
      case 'c':
        return {setColor: value()};
      case 'p': {
        const paintColor = value();
        if (advance() !== ',') {
          throw new Error('expecting comma');
        }
        const borderColor = value();
        return {paint: {paintColor, borderColor}};
      }
      case 'x':
        return {execute: pointerValue()};
      default:
        break;
    }
    throw new Error('unrecognized command');
  };
  const program: DrawProgram = {commands: []};
  while (!atEnd()) {
    const char = advance();
    switch (char) {
      // Any number of b or n may precede any command and apply to the next movement command.
      case 'b':
        noPlot = true;
        break;
      case 'n':
        comeBack = true;
        break;
      default:
        const current = command(char);
        program.commands.push(current);
        if (current.move) {
          noPlot = false;
          comeBack = false;
        }
        break;
    }
  }
  return program;
}

function wrap16Bit(x: number) {
  return x & 0x8000 ? (x & 0x7fff) - 0x8000 : x & 0x7fff;
}