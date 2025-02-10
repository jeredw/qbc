import { Type, TypeTag } from "./Types.ts";
import { ExprContext } from "../build/QBasicParser.ts";
import { Statement } from "./statements/Statement.ts";
import { Variable } from "./Variables.ts";
import { Token } from "antlr4ng";
import * as statements from "./statements/StatementRegistry.ts";

export interface Builtin {
  name: string;
  returnType?: Type;
  arguments: Type[];
  statement: (token: Token, params: ExprContext[], result?: Variable) => Statement;
}

export class StandardLibrary {
  builtins: Map<string, Builtin> = new Map([
    ["abs", {name: "abs", returnType: {tag: TypeTag.NUMERIC}, arguments: [{tag: TypeTag.NUMERIC}], statement: statements.abs}],
    ["asc", {name: "asc", returnType: {tag: TypeTag.INTEGER}, arguments: [{tag: TypeTag.STRING}], statement: statements.asc}],
    ["atn", {name: "atn", returnType: {tag: TypeTag.DOUBLE}, arguments: [{tag: TypeTag.DOUBLE}], statement: statements.atn}],
    ["beep", {name: "beep", arguments: [], statement: statements.beep}],
    ["cdbl", {name: "cdbl", returnType: {tag: TypeTag.DOUBLE}, arguments: [{tag: TypeTag.NUMERIC}], statement: statements.cdbl}],
    ["chr", {name: "chr", returnType: {tag: TypeTag.STRING}, arguments: [{tag: TypeTag.NUMERIC}], statement: statements.chr}],
    ["csng", {name: "csng", returnType: {tag: TypeTag.SINGLE}, arguments: [{tag: TypeTag.NUMERIC}], statement: statements.csng}],
    ["cint", {name: "cint", returnType: {tag: TypeTag.INTEGER}, arguments: [{tag: TypeTag.NUMERIC}], statement: statements.cint}],
    ["clng", {name: "clng", returnType: {tag: TypeTag.LONG}, arguments: [{tag: TypeTag.NUMERIC}], statement: statements.clng}],
  ]);

  lookup(name: string): Builtin | undefined {
    return this.builtins.get(name.toLowerCase());
  }
}