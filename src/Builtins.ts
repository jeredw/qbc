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
}

let _ = parseBuiltinSpec;

export class StandardLibrary {
  builtins: Map<string, Builtin> = new Map([
    _("abs numeric -> numeric", statements.abs),
    _("asc string -> integer", statements.asc),
    _("atn numeric -> float", statements.atn),
    _("beep", statements.beep),
    _("bload string integer?", statements.bload),
    _("bsave string integer long", statements.bsave),
    _("cdbl numeric -> double", statements.cdbl),
    _("chain string", statements.chain),
    _("chdir string", statements.chdir),
    _("chr integer -> string", statements.chr),
    _("cint numeric -> integer", statements.cint),
    _("clng numeric -> long", statements.clng),
    _("cls integer?", statements.cls),
    _("command -> string", statements.command),
    _("cos numeric -> float", statements.cos),
    _("csng numeric -> single", statements.csng),
    _("csrlin -> integer", statements.csrlin),
    _("cvd string -> double", statements.cvd),
    _("cvdmbf string -> double", statements.cvdmbf),
    _("cvi string -> integer", statements.cvi),
    _("cvl string -> long", statements.cvl),
    _("cvs string -> single", statements.cvs),
    _("cvsmbf string -> single", statements.cvsmbf),
    _("draw string", statements.draw),
    _("eof integer -> integer", statements.eof),
    _("erl -> long", statements.erl),
    _("err -> integer", statements.err),
    _("exp numeric -> float", statements.exp),
    _("fileattr integer integer -> integer", statements.fileattr),
    _("files string?", statements.files),
    _("fix numeric -> numeric", statements.fix),
    _("freefile -> integer", statements.freefile),
    _("fre any -> long", statements.fre),
    _("hex long -> string", statements.hex),
    _("inkey -> string", statements.inkey),
    _("inp long -> integer", statements.inp),
    _("int numeric -> numeric", statements.int),
    _("kill string", statements.kill),
    _("lcase string -> string", statements.lcase),
    _("left string integer -> string", statements.left),
    _("loc integer -> long", statements.loc),
    _("lof integer -> long", statements.lof),
    _("log numeric -> float", statements.log),
    _("lpos integer -> integer", statements.lpos),
    _("ltrim string -> string", statements.ltrim),
    _("mkd double -> string", statements.mkd),
    _("mkdir string", statements.mkdir),
    _("mkdmbf double -> string", statements.mkdmbf),
    _("mki integer -> string", statements.mki),
    _("mkl long -> string", statements.mkl),
    _("mks single -> string", statements.mks),
    _("mksmbf single -> string", statements.mksmbf),
    _("oct long -> string", statements.oct),
    _("out long integer", statements.out),
    _("pcopy integer integer", statements.pcopy),
    _("peek long -> integer", statements.peek),
    _("pmap double integer -> integer", statements.pmap),
    _("point integer integer? -> double", statements.point),
    _("poke long integer", statements.poke),
    _("pos integer -> integer", statements.pos),
    _("reset", statements.reset),
    _("right string integer -> string", statements.right),
    _("rmdir string", statements.rmdir),
    _("rtrim string -> string", statements.rtrim),
    _("rnd single? -> single", statements.rnd),
    _("setmem long -> long", statements.setmem),
    _("sgn numeric -> numeric", statements.sgn),
    _("shell string", statements.shell),
    _("sin numeric -> float", statements.sin),
    _("sleep long?", statements.sleep),
    _("sound integer single", statements.sound),
    _("space integer -> string", statements.space),
    _("sqr numeric -> float", statements.sqr),
    _("stick integer -> integer", statements.stick),
    _("str numeric -> string", statements.str),
    _("string integer any -> string", statements.string),
    _("system", statements.system),
    _("tan numeric -> float", statements.tan),
    _("ucase string -> string", statements.ucase),
    _("val string -> double", statements.val),
    _("wait long integer integer?", statements.wait),
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
    case "float": return {type: {tag: TypeTag.FLOAT}, optional};
    case "any": return {type: {tag: TypeTag.ANY}, optional};
  }
  throw new Error(`invalid argument ${name}`);
}