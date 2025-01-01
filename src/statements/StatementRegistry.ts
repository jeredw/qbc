import { DefFnStatement } from "./DefFn.ts";
import { ExitStatement } from "./Exit.ts";
import { GotoStatement } from "./Goto.ts";
import { PrintStatement } from "./Print.ts";
import { Type } from "../Types";
import * as parser from "../../build/QBasicParser";

export function defFn(name: string, returnType: Type) {
  return new DefFnStatement(name, returnType);
}

export function exit(returnFromProcedure: boolean) {
  return new ExitStatement(returnFromProcedure);
}

export function goto() {
  return new GotoStatement();
}

export function next() {
  return new GotoStatement();
}

export function print(ast: parser.Print_statementContext) {
  return new PrintStatement(ast);
}