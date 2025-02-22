import { Type, TypeTag } from "./Types.ts";
import { ExprContext } from "../build/QBasicParser.ts";
import { Statement } from "./statements/Statement.ts";
import { Variable } from "./Variables.ts";
import { Token } from "antlr4ng";
import * as statements from "./statements/StatementRegistry.ts";

export interface BuiltinParams {
  token: Token;
  params: ExprContext[];
  result?: Variable;
}

export interface BuiltinArgument {
  type: Type;
  wantArray?: boolean;
  optional?: boolean;
}

export interface Builtin {
  name: string;
  returnType?: Type;
  arguments: BuiltinArgument[];
  statement: (params: BuiltinParams) => Statement;
}

let _ = parseBuiltinSpec;

export class StandardLibrary {
  builtins: Map<string, Builtin> = new Map([
    _("abs numeric -> numeric", statements.abs),
    _("asc string -> integer", statements.asc),
    _("atn double -> double", statements.atn),
    _("beep", statements.beep),
    _("cdbl numeric -> double", statements.cdbl),
    _("chr numeric -> string", statements.chr),
    _("cos double -> double", statements.cos),
    _("csng numeric -> single", statements.csng),
    _("cint numeric -> integer", statements.cint),
    _("clng numeric -> long", statements.clng),
    _("cvi string -> integer", statements.cvi),
    _("cvd string -> double", statements.cvd),
    _("cvdmbf string -> double", statements.cvdmbf),
    _("cvl string -> long", statements.cvl),
    _("cvs string -> single", statements.cvs),
    _("cvsmbf string -> single", statements.cvsmbf),
    _("mki numeric -> string", statements.mki),
    _("mkd numeric -> string", statements.mkd),
    _("mkdmbf numeric -> string", statements.mkdmbf),
    _("mkl numeric -> string", statements.mkl),
    _("mks numeric -> string", statements.mks),
    _("mksmbf numeric -> string", statements.mksmbf),
    _("sin double -> double", statements.sin),
    _("tan double -> double", statements.tan),
  ]);

  lookup(name: string): Builtin | undefined {
    return this.builtins.get(name.toLowerCase());
  }
}

function parseBuiltinSpec(spec: string, statement: (params: BuiltinParams) => Statement): [string, Builtin] {
  const result = spec.match(/^([a-z]+)(\s+[a-z?, ]+)?(->\s+[a-z]+)?/);
  if (!result) {
    throw new Error(`invalid builtin definition: ${spec}`);
  }
  const [_, name, argSpec, returnSpec] = result;
  const args: BuiltinArgument[] = [];
  if (argSpec) {
    for (let argType of argSpec.split(/\s*,\s*/)) {
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

function parseTypeSpec(name: string, optional: boolean): BuiltinArgument {
  switch (name) {
    case "single": return {type: {tag: TypeTag.SINGLE}, optional};
    case "double": return {type: {tag: TypeTag.DOUBLE}, optional};
    case "integer": return {type: {tag: TypeTag.INTEGER}, optional};
    case "long": return {type: {tag: TypeTag.LONG}, optional};
    case "string": return {type: {tag: TypeTag.STRING}, optional};
    case "numeric": return {type: {tag: TypeTag.NUMERIC}, optional};
    case "array": return {type: {tag: TypeTag.ANY}, wantArray: true, optional};
  }
  throw new Error(`invalid argument ${name}`);
}