import { Type, TypeTag } from "./Types.ts";
import { ExprContext } from "../build/QBasicParser.ts";
import { Statement } from "./statements/Statement.ts";
import { Variable } from "./Variables.ts";
import { Token } from "antlr4ng";
import * as statements from "./statements/StatementRegistry.ts";

export interface Builtin {
  name: string;
  returnType?: Type;
  arguments: BuiltinArgumentSpec[];
  statement: StatementFactory;
}

export interface BuiltinArgumentSpec {
  type: Type;
  optional?: boolean;
}

type StatementFactory = (args: BuiltinStatementArgs) => Statement;

export interface BuiltinStatementArgs {
  token: Token;
  params: BuiltinParam[];
  result?: Variable;
}

export interface BuiltinParam {
  expr?: ExprContext;
  variable?: Variable;
}

let _ = parseBuiltinSpec;

export class StandardLibrary {
  builtins: Map<string, Builtin> = new Map([
    _("abs numeric -> numeric", statements.abs),
    _("asc string -> integer", statements.asc),
    _("atn double -> double", statements.atn),
    _("beep", statements.beep),
    _("cdbl numeric -> double", statements.cdbl),
    _("chdir string", statements.chdir),
    _("chr numeric -> string", statements.chr),
    _("cint numeric -> integer", statements.cint),
    _("clng numeric -> long", statements.clng),
    _("cos double -> double", statements.cos),
    _("csng numeric -> single", statements.csng),
    _("cvd string -> double", statements.cvd),
    _("cvdmbf string -> double", statements.cvdmbf),
    _("cvi string -> integer", statements.cvi),
    _("cvl string -> long", statements.cvl),
    _("cvs string -> single", statements.cvs),
    _("cvsmbf string -> single", statements.cvsmbf),
    _("eof integer -> integer", statements.eof),
    _("exp double -> double", statements.exp),
    _("fileattr integer integer -> integer", statements.fileattr),
    _("files string?", statements.files),
    _("fix numeric -> numeric", statements.fix),
    _("freefile -> integer", statements.freefile),
    _("hex long -> string", statements.hex),
    _("inkey -> string", statements.inkey),
    _("inp long -> integer", statements.inp),
    _("int numeric -> numeric", statements.int),
    _("kill string", statements.kill),
    _("lcase string -> string", statements.lcase),
    _("left string integer -> string", statements.left),
    _("loc integer -> long", statements.loc),
    _("lof integer -> long", statements.lof),
    _("log double -> double", statements.log),
    _("ltrim string -> string", statements.ltrim),
    _("mkd numeric -> string", statements.mkd),
    _("mkdir string", statements.mkdir),
    _("mkdmbf numeric -> string", statements.mkdmbf),
    _("mki numeric -> string", statements.mki),
    _("mkl numeric -> string", statements.mkl),
    _("mks numeric -> string", statements.mks),
    _("mksmbf numeric -> string", statements.mksmbf),
    _("oct long -> string", statements.oct),
    _("right string integer -> string", statements.right),
    _("rmdir string", statements.rmdir),
    _("rtrim string -> string", statements.rtrim),
    _("sgn numeric -> numeric", statements.sgn),
    _("sin double -> double", statements.sin),
    _("sleep long?", statements.sleep),
    _("space numeric -> string", statements.space),
    _("sqr double -> double", statements.sqr),
    _("stick integer -> integer", statements.stick),
    _("str numeric -> string", statements.str),
    _("string integer any -> string", statements.string),
    _("tan double -> double", statements.tan),
    _("ucase string -> string", statements.ucase),
    _("val string -> double", statements.val),
  ]);

  lookup(name: string): Builtin | undefined {
    return this.builtins.get(name.toLowerCase());
  }
}

function parseBuiltinSpec(spec: string, statement: StatementFactory): [string, Builtin] {
  const result = spec.match(/^([a-z]+)(\s+[a-z? ]+)?\s*(->\s+[a-z]+)?/);
  if (!result) {
    throw new Error(`invalid builtin definition: ${spec}`);
  }
  const [_, name, argSpec, returnSpec] = result;
  const args: BuiltinArgumentSpec[] = [];
  if (argSpec) {
    for (let argType of argSpec.split(/\s+/)) {
      if (!argType) {
        continue;
      }
      const optional = argType.endsWith('?');
      if (argType.endsWith('?')) {
        argType = argType.slice(0, -1);
      }
      args.push(parseTypeSpec(argType.trim(), optional));
    }
  }
  let returnType: Type | undefined;
  if (returnSpec) {
    const [_, typeSpec] = returnSpec.split(/\s*->\s*/);
    returnType = parseTypeSpec(typeSpec.trim(), false).type;
  }
  return [name, {name, arguments: args, returnType, statement}];
}

function parseTypeSpec(name: string, optional: boolean): BuiltinArgumentSpec {
  switch (name) {
    case "single": return {type: {tag: TypeTag.SINGLE}, optional};
    case "double": return {type: {tag: TypeTag.DOUBLE}, optional};
    case "integer": return {type: {tag: TypeTag.INTEGER}, optional};
    case "long": return {type: {tag: TypeTag.LONG}, optional};
    case "string": return {type: {tag: TypeTag.STRING}, optional};
    case "numeric": return {type: {tag: TypeTag.NUMERIC}, optional};
    case "any": return {type: {tag: TypeTag.ANY}, optional};
  }
  throw new Error(`invalid argument ${name}`);
}