import {
  Const_statementContext,
  Data_statementContext,
  Declare_statementContext,
  Def_fn_parameter_listContext,
  Def_fn_parameterContext,
  Def_fn_statementContext,
  Deftype_statementContext,
  Do_loop_statementContext,
  Exit_statementContext,
  Fixed_stringContext,
  For_next_statementContext,
  Function_statementContext,
  Implicit_goto_targetContext,
  LabelContext,
  Option_statementContext,
  Parameter_listContext,
  ParameterContext,
  Rem_statementContext,
  Scope_statementContext,
  Sub_statementContext,
  TargetContext,
  Type_statementContext,
  Untyped_fnidContext,
  Untyped_idContext,
} from "../build/QBasicParser.ts";
import { QBasicParserListener } from "../build/QBasicParserListener.ts";
import { ParserRuleContext, ParseTree, TerminalNode } from "antlr4ng";
import { ParseError } from "./Errors.ts";
import {
  TypeTag,
  Type,
  UserDefinedType,
  UserDefinedTypeElement,
  typeOfDefType,
  typeOfName,
  typeOfSigil,
} from "./Types.ts";
import { Procedure } from "./Procedures.ts"
import { Variable } from "./Variables.ts";

interface ProgramChunk {
  statements: ParserRuleContext[];
  targets: Map<number, string>;
  labels: Map<string, number>;
  procedure?: Procedure;
}

export class ProgramChunker extends QBasicParserListener {
  private _allLabels: Set<string> = new Set();
  private _types: Map<string, UserDefinedType> = new Map();
  private _firstCharToDefaultType: Map<string, Type> = new Map();
  private _procedures: Map<string, ProgramChunk> = new Map();
  private _fns: Map<TypeTag, Map<string, ProgramChunk>> = new Map([
    [TypeTag.SINGLE, new Map()],
    [TypeTag.DOUBLE, new Map()],
    [TypeTag.STRING, new Map()],
    [TypeTag.INTEGER, new Map()],
    [TypeTag.LONG, new Map()],
  ]);
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

  private makeProgramChunk(procedure?: Procedure): ProgramChunk {
    return {labels: new Map(), statements: [], targets: new Map(), procedure};
  }

  override enterFunction_statement = (ctx: Function_statementContext) => {
    const [name, sigil] = splitSigil(ctx.ID().getText().toLowerCase());
    if (this._procedures.has(name)) {
      throw ParseError.fromToken(ctx.ID().symbol, "Duplicate definition");
    }
    const returnType = sigil ? typeOfSigil(sigil) : this.getDefaultType(name);
    const parameters = this.parseParameterList(ctx.parameter_list());
    const staticStorage = !!ctx.STATIC();
    this._chunk = this.makeProgramChunk({name, returnType, parameters, staticStorage});
    this._procedures.set(name, this._chunk);
  }

  override enterDef_fn_statement = (ctx: Def_fn_statementContext) => {
    const rawName = ctx._name!.text!.toLowerCase();
    // Correct "def fn foo" to "def fnfoo".
    const fnPrefixed = rawName.startsWith('fn') ? rawName : `fn${rawName}`;
    const [name, sigil] = splitSigil(fnPrefixed);
    const returnType = sigil ? typeOfSigil(sigil) : this.getDefaultType(name);
    const table = this._fns.get(returnType.tag)!;
    // Note that any sigil is included in the name of a def fn.
    if (table.has(name)) {
      throw ParseError.fromToken(ctx._name!, "Duplicate definition");
    }
    // Labels on def fn refer to the defining statement in the toplevel.
    this._chunk.statements.push(ctx);
    const parameters = this.parseDefFnParameterList(ctx.def_fn_parameter_list());
    this._chunk = this.makeProgramChunk({name, returnType, parameters});
    table.set(name, this._chunk);
  }

  override enterSub_statement = (ctx: Sub_statementContext) => {
    const name = getUntypedId(ctx.untyped_id());
    if (this._procedures.has(name)) {
      throw ParseError.fromToken(ctx.untyped_id().start!, "Duplicate definition");
    }
    const parameters = this.parseParameterList(ctx.parameter_list());
    const staticStorage = !!ctx.STATIC();
    this._chunk = this.makeProgramChunk({name, parameters, staticStorage});
    this._procedures.set(name, this._chunk);
  }

  private exitProcedure = (_ctx: ParserRuleContext) => {
    this._chunk = this._topLevel;
  }

  override exitFunction_statement = this.exitProcedure;
  override exitDef_fn_statement = this.exitProcedure;
  override exitSub_statement = this.exitProcedure;

  private checkNoExecutableStatements(ctx: ParserRuleContext) {
    for (const statement of this._chunk.statements) {
      if (!isNonExecutableStatement(statement)) {
        throw ParseError.fromToken(ctx.start!, "COMMON and DECLARE must precede executable statements");
      }
    }
  }

  private statement = (ctx: ParserRuleContext) => {
    this._chunk.statements.push(ctx);
  }

  override enterStatement = this.statement;
  override enterIf_block_statement = this.statement;
  override enterOption_statement = this.statement;
  override enterCase_statement = this.statement;
  override enterEnd_select_statement = this.statement;
  override enterEnd_function_statement = this.statement;
  override enterElseif_block_statement = this.statement;
  override enterElse_block_statement = this.statement;
  override enterEnd_sub_statement = this.statement;
  override enterEnd_if_statement = this.statement;

  override enterDeclare_statement = (ctx: ParserRuleContext) => {
    this.statement(ctx);
    // Mismatches between DECLARE statements and SUB/FUNCTION definitions are
    // errors on the DECLARE statement, so they are checked during execution.
    this.checkNoExecutableStatements(ctx);
  }

  override enterExit_statement = (ctx: Exit_statementContext) => {
    if (ctx.DEF()) {
      if (!hasParent(ctx, Def_fn_statementContext)) {
        throw ParseError.fromToken(ctx.start!, "EXIT DEF not within DEF FN");
      }
    } else if (ctx.DO()) {
      if (!hasParent(ctx, Do_loop_statementContext)) {
       throw ParseError.fromToken(ctx.start!, "EXIT DO not within DO...LOOP");
      }
    } else if (ctx.FOR()) {
      if (!hasParent(ctx, For_next_statementContext)) {
        throw ParseError.fromToken(ctx.start!, "EXIT FOR not within FOR...NEXT");
      }
    } else if (ctx.FUNCTION()) {
      if (!hasParent(ctx, Function_statementContext)) {
        throw ParseError.fromToken(ctx.start!, "EXIT FUNCTION not within FUNCTION");
      }
    } else if (ctx.SUB()) {
      if (!hasParent(ctx, Sub_statementContext)) {
        throw ParseError.fromToken(ctx.start!, "EXIT SUB not within SUB");
      }
    } else {
      throw new Error("invalid block type");
    }
  }

  override enterDeftype_statement = (ctx: Deftype_statementContext) => {
    const keyword = ctx.children[0].getText();
    const type = typeOfDefType(keyword);
    for (const letterRange of ctx.letter_range()) {
      const first = firstCharOfId(letterRange._first!.text!).charCodeAt(0);
      // Ranges can be just a single character.
      const second = letterRange._second ?
        firstCharOfId(letterRange._second.text!).charCodeAt(0) :
        first;
      // Ranges may be flipped.
      const start = Math.min(first, second);
      const end = Math.max(first, second);
      for (let i = start; i <= end; i++) {
        this._firstCharToDefaultType.set(String.fromCharCode(i), type);
      }
    }
  }

  override enterType_statement = (ctx: Type_statementContext) => {
    this._chunk.statements.push(ctx);
    const nameCtx = ctx.untyped_id() ?? ctx.untyped_fnid();
    const name = getUntypedId(nameCtx!, /* allowPeriods= */ false);
    const elements: UserDefinedTypeElement[] = [];
    for (const elementCtx of ctx.type_element()) {
      const elementNameCtx = elementCtx.untyped_id() ?? elementCtx.untyped_fnid();
      const elementName = getUntypedId(elementNameCtx!, /* allowPeriods= */ false);
      const typeNameCtx = elementCtx.type_name_for_type_element();
      const elementType = this.getType(typeNameCtx);
      elements.push({name: elementName, type: elementType});
    }
    this._types.set(name, {tag: TypeTag.RECORD, name, elements});
  }

  private parseParameterList(ctx: Parameter_listContext | null): Variable[] {
    return ctx?.parameter().map((param) => this.parseParameter(param)) ?? [];
  }

  private parseDefFnParameterList(ctx: Def_fn_parameter_listContext | null): Variable[] {
    return ctx?.def_fn_parameter().map((param) => this.parseParameter(param)) ?? [];
  }

  private parseParameter(ctx: ParameterContext | Def_fn_parameterContext): Variable {
    const nameCtx = ctx.untyped_id();
    const rawName = nameCtx ? getUntypedId(nameCtx) : ctx.ID()!.getText();
    const [name, sigil] = splitSigil(rawName);
    const asTypeCtx = ctx instanceof ParameterContext ?
      ctx.type_name_for_parameter() :
      ctx.type_name_for_def_fn_parameter();
    const typeSpec: Type = sigil ? typeOfSigil(sigil) :
      asTypeCtx ? this.getType(asTypeCtx) :
      this.getDefaultType(name);
    const type: Type = (ctx instanceof ParameterContext && ctx.array_declaration()) ?
      {tag: TypeTag.ARRAY, elementType: typeSpec} :
      typeSpec;
    return {type, name};
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
      return {tag: TypeTag.FIXED_STRING, maxLength};
    }
    return typeOfName(child.getText());
  }

  private getDefaultType(name: string): Type {
    const type = this._firstCharToDefaultType.get(firstCharOfId(name));
    return type ?? {tag: TypeTag.SINGLE};
  }
}

function firstCharOfId(name: string) {
  const lower = name.toLowerCase();
  return lower.startsWith('fn') ? name.slice(2, 1) : name.slice(0, 1);
}

function getUntypedId(ctx: Untyped_idContext | Untyped_fnidContext, allowPeriods: boolean = true): string {
  const id = checkUntyped(ctx.getText(), ctx, "Identifier cannot end with %, &, !, # or $");
  if (!allowPeriods && id.includes('.')) {
      throw ParseError.fromToken(ctx.start!, "Identifier cannot include period");
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

type RuleConstructor<T extends ParserRuleContext> = { new (ctx: ParserRuleContext | null, rule: number): T }

function hasParent<T extends ParserRuleContext>(
  ctx: ParserRuleContext,
  constructor: RuleConstructor<T>): boolean {
  while (ctx.parent) {
    if (ctx.parent instanceof constructor) {
      return true;
    }
    ctx = ctx.parent;
  }
  return false;
}

function isNonExecutableStatement(ctx: ParserRuleContext): boolean {
  return ctx instanceof Scope_statementContext ||
    ctx instanceof Const_statementContext ||
    ctx instanceof Data_statementContext ||
    ctx instanceof Declare_statementContext ||
    ctx instanceof Deftype_statementContext ||
    // TODO: DIM (static only)
    ctx instanceof Option_statementContext ||
    ctx instanceof Rem_statementContext ||
    ctx instanceof Type_statementContext;
}