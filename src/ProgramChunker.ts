import {
  Def_fn_statementContext,
  Function_statementContext,
  Fixed_stringContext,
  Implicit_goto_targetContext,
  LabelContext,
  Sub_statementContext,
  TargetContext,
  Type_elementContext,
  Type_name_for_type_elementContext,
  Type_statementContext,
  Untyped_fnidContext,
  Untyped_idContext,
  Deftype_statementContext,
  Letter_rangeContext,
} from "../build/QBasicParser.ts";
import { QBasicParserListener } from "../build/QBasicParserListener.ts";
import { ParserRuleContext, ParseTree, TerminalNode, Token } from "antlr4ng";
import { ParseError } from "./Errors.ts";
import { QBasicType, Type, UserDefinedType, UserDefinedTypeElement, typeOfName, typeOfDefType } from "./Types.ts";
import { Procedure } from "./Procedures.ts"

interface ProgramChunk {
  procedure?: Procedure;
  statements: ParserRuleContext[];
  targets: Map<number, string>;
  labels: Map<string, number>;
}

export class ProgramChunker extends QBasicParserListener {
  private _allLabels: Set<string> = new Set();
  private _types: Map<string, UserDefinedType> = new Map();
  private _firstCharToDefaultType: Map<string, Type> = new Map();
  private _procedures: Map<string, ProgramChunk> = new Map();
  private _topLevel: ProgramChunk;
  private _chunk: ProgramChunk;

  constructor() {
    super();
    this._topLevel = this.makeProgramChunk();
    this._chunk = this._topLevel;
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

  private checkTargets(chunk: ProgramChunk) {
    chunk.targets.forEach((target, statementIndex) => {
      if (!chunk.labels.has(target)) {
        const statement = chunk.statements[statementIndex];
        throw ParseError.fromToken(statement.start!, "Label not defined");
      }
    });
  }

  override enterLabel = (ctx: LabelContext) => {
    const label = this.canonicalizeLabel(ctx);
    if (this._allLabels.has(label)) {
      throw ParseError.fromToken(ctx.start!, "Duplicate label");
    }
    this._allLabels.add(label);
    this._chunk.labels.set(label, this._chunk.statements.length);
  }

  override enterTarget = (ctx: TargetContext) => {
    const label = this.canonicalizeLabel(ctx);
    const statementIndex = this._chunk.statements.length - 1;
    this._chunk.targets.set(statementIndex, label);
  }

  override enterImplicit_goto_target = (ctx: Implicit_goto_targetContext) => {
    this._chunk.statements.push(ctx);
    const label = this.canonicalizeLabel(ctx);
    const statementIndex = this._chunk.statements.length - 1;
    this._chunk.targets.set(statementIndex, label);
  }

  private canonicalizeLabel(ctx: ParserRuleContext): string {
    const label = ctx.getText();
    const stripped = label.endsWith(':') ? label.substring(0, label.length - 1) : label;
    return checkUntyped(stripped.toLowerCase(), ctx, "Expected: label or line number");
  }

  private statement = (ctx: ParserRuleContext) => {
    this._chunk.statements.push(ctx);
  }

  private exitProcedure = (_ctx: ParserRuleContext) => {
    const name = this._chunk.procedure!.name;
    this._procedures.set(name, this._chunk);
    this._chunk = this._topLevel;
  }

  private makeProgramChunk(procedure?: Procedure): ProgramChunk {
    return {labels: new Map(), statements: [], targets: new Map(), procedure};
  }

  override enterFunction_statement = (ctx: Function_statementContext) => {
    const nameCtx = ctx.children[1] as TerminalNode;
    const [name, sigil] = splitSigil(nameCtx.getText().toLowerCase());
    if (this._procedures.has(name)) {
      throw ParseError.fromToken(nameCtx.symbol, "Duplicate definition");
    }
    this.statement(ctx);
    this._chunk = this.makeProgramChunk({name, arguments: []});
  }

  override exitFunction_statement = this.exitProcedure;

  override enterDef_fn_statement = (ctx: Def_fn_statementContext) => {
    const rawName = ctx._name!.text!.toLowerCase();
    // Correct "def fn foo" to "def fnfoo".
    const name = rawName.startsWith('fn') ? rawName : `fn${rawName}`;
    // Note that any sigil is included in the name of a def fn.
    if (this._procedures.has(name)) {
      throw ParseError.fromToken(ctx._name!, "Duplicate definition");
    }
    this.statement(ctx);
    this._chunk = this.makeProgramChunk({name, arguments: []});
  }

  override exitDef_fn_statement = this.exitProcedure;

  override enterSub_statement = (ctx: Sub_statementContext) => {
    const nameCtx = ctx.children[1] as ParserRuleContext;
    const name = getUntypedId(nameCtx);
    if (this._procedures.has(name)) {
      throw ParseError.fromToken(nameCtx.start!, "Duplicate definition");
    }
    this.statement(ctx);
    this._chunk = this.makeProgramChunk({name, arguments: []});
  }

  override exitSub_statement = this.exitProcedure;

  override enterStatement = this.statement;
  override enterDeclare_statement = this.statement;
  override enterIf_block_statement = this.statement;
  override enterOption_statement = this.statement;
  override enterCase_statement = this.statement;
  override enterEnd_select_statement = this.statement;
  override enterEnd_function_statement = this.statement;
  override enterElseif_block_statement = this.statement;
  override enterElse_block_statement = this.statement;
  override enterEnd_sub_statement = this.statement;
  override enterEnd_if_statement = this.statement;

  override enterDeftype_statement = (ctx: Deftype_statementContext) => {
    const keyword = ctx.children[0].getText();
    const type = typeOfDefType(keyword);
    const parseRangeEnd = (text: string) => {
      const lower = text.toLowerCase();
      return lower.startsWith('fn') ? lower.slice(2, 3) : lower.slice(0, 1);
    };
    for (const child of ctx.children) {
      if (!(child instanceof Letter_rangeContext)) {
        continue;
      }
      const letterRange = child as Letter_rangeContext;
      const start = parseRangeEnd(letterRange.children[0].getText());
      const end = letterRange.children.length == 3 ?
        parseRangeEnd(letterRange.children[2].getText()) :
        start;
      // Ranges may be flipped.
      const firstChar = Math.min(start.charCodeAt(0), end.charCodeAt(0));
      const lastChar = Math.max(start.charCodeAt(0), end.charCodeAt(0));
      for (let i = firstChar; i <= lastChar; i++) {
        this._firstCharToDefaultType.set(String.fromCharCode(i), type);
      }
    }
  }

  override enterType_statement = (ctx: Type_statementContext) => {
    this._chunk.statements.push(ctx);
    const name = getUntypedId(ctx.children[1], /* allowPeriods= */ false);
    const elements: UserDefinedTypeElement[] = [];
    for (const child of ctx.children) {
      if (!(child instanceof Type_elementContext)) {
        continue;
      }
      const elementCtx = child as Type_elementContext;
      const elementName = getUntypedId(elementCtx.children[0], /* allowPeriods= */ false);
      const typeNameCtx = elementCtx.children[2];
      if (!(typeNameCtx instanceof Type_name_for_type_elementContext)) {
        throw ParseError.fromToken(elementCtx.start!, "Expecting type name");
      }
      const elementType = this.getType(typeNameCtx);
      elements.push({name: elementName, type: elementType});
    }
    this._types.set(name, {qbasicType: QBasicType.RECORD, name, elements});
  }

  private getType(ctx: ParserRuleContext): Type {
    if (ctx.children.length != 1) {
      throw new Error('expecting exactly one child');
    }
    const child = ctx.children[0];
    if (child instanceof Untyped_idContext || child instanceof Untyped_fnidContext) {
      const typeName = getUntypedId(child, /* allowPeriods= */ false);
      const type = this._types.get(typeName);
      if (!type) {
        throw ParseError.fromToken(ctx.start!, "Type not defined");
      }
      return type;
    }
    if (child instanceof Fixed_stringContext) {
      const fixedString = child as Fixed_stringContext;
      const maxLength = parseInt(fixedString.DIGITS()!.getText(), 10);
      return {qbasicType: QBasicType.FIXED_STRING, maxLength};
    }
    return typeOfName(child.getText());
  }
}

function getUntypedId(tree: ParseTree, allowPeriods: boolean = true): string {
  if (!(tree instanceof Untyped_idContext || tree instanceof Untyped_fnidContext)) {
    throw new Error("Expecting identifier");
  }
  const idCtx = tree as ParserRuleContext;
  const id = checkUntyped(idCtx.getText(), idCtx, "Identifier cannot end with %, &, !, # or $");
  if (!allowPeriods && id.includes('.')) {
      throw ParseError.fromToken(idCtx.start!, "Identifier cannot include period");
  }
  return id.toLowerCase();
}

function checkUntyped(name: string, ctx: ParserRuleContext, message: string) {
  const [_, sigil] = splitSigil(name);
  if (sigil) {
    throw ParseError.fromToken(ctx.start!, message);
  }
  return name;
}

function splitSigil(name: string): [string, string] {
  const lastChar = name.slice(-1);
  if ("!#$%&".includes(lastChar)) {
    return [name.slice(0, -1), lastChar];
  }
  return [name, ""];
}