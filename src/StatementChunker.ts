import { LabelContext } from "../build/QBasicParser.js";
import { Def_fn_statementContext, Exit_statementContext, Function_statementContext, TargetContext } from "../build/QBasicParser.ts";
import { QBasicParserListener } from "../build/QBasicParserListener.ts";
import { ParserRuleContext, ParseTree } from "antlr4ng";
import { ParseError } from "./Errors.ts";

interface Context {
  labels: Map<string, number>;
  statements: ParserRuleContext[];
  targets: Map<number, string>;
}

export class StatementChunker extends QBasicParserListener {
  private _allLabels: Set<string> = new Set();
  private _procedures: Map<string, Context> = new Map();
  private _topLevel: Context;
  private _context: Context;

  constructor() {
    super();
    this._topLevel = this.makeContext();
    this._context = this._topLevel;
  }

  get statements() {
    return this._topLevel.statements;
  }

  checkAllTargetsDefined() {
    this.checkTargets(this._topLevel);
    for (const proc of this._procedures.values()) {
      this.checkTargets(proc);
    }
  }

  private checkTargets(context: Context) {
    context.targets.forEach((target, statementIndex) => {
      if (!context.labels.has(target)) {
        const statement = context.statements[statementIndex];
        throw new ParseError(statement.start!, "Label not defined");
      }
    });
  }

  override enterLabel = (ctx: LabelContext) => {
    const label = this.canonicalizeLabel(ctx.getText());
    if (this._allLabels.has(label)) {
      throw new ParseError(ctx.start!, 'Duplicate label');
    }
    this._allLabels.add(label);
    this._context.labels.set(label, this._context.statements.length);
  }

  override enterTarget = (ctx: TargetContext) => {
    const label = this.canonicalizeLabel(ctx.getText());
    const statementIndex = this._context.statements.length - 1;
    this._context.targets.set(statementIndex, label);
  }

  private canonicalizeLabel(label: string): string {
    const stripped = label.endsWith(':') ?  label.substring(0, label.length - 1) : label;
    return stripped.toLowerCase();
  }

  private statement = (ctx: ParserRuleContext) => {
    this._context.statements.push(ctx);
  }

  private procedure = (ctx: ParserRuleContext) => {
    this.statement(ctx);
    this._context = this.makeContext();
  }

  private exitProcedure(name: string) {
    this._procedures.set(name, this._context);
    this._context = this._topLevel;
  }

  private makeContext(): Context {
    return {labels: new Map(), statements: [], targets: new Map()};
  }

  override enterFunction_statement = this.procedure;
  override enterDef_fn_statement = this.procedure;
  override enterSub_statement = this.procedure;

  override exitFunction_statement = (ctx: Function_statementContext) => {
    this.exitProcedure(ctx._name.text);
  }

  override exitDef_fn_statement = (ctx: Def_fn_statementContext) => {
    let name = ctx._name.text;
    if (!name.toLowerCase().startsWith('fn')) {
      name = `fn${name}`;
    }
    this.exitProcedure(name);
  }

  override exitSub_statement = (ctx: Exit_statementContext) => {
    this.exitProcedure(this._name.text);
  }

  override enterStatement = this.statement;
  override enterDeclare_statement = this.statement;
  override enterIf_block_statement = this.statement;
  override enterOption_statement = this.statement;
  override enterType_statement = this.statement;
  override enterCase_statement = this.statement;
  override enterEnd_select_statement = this.statement;
  override enterEnd_function_statement = this.statement;
  override enterElseif_block_statement = this.statement;
  override enterElse_block_statement = this.statement;
  override enterEnd_sub_statement = this.statement;
  override enterEnd_if_statement = this.statement;
}