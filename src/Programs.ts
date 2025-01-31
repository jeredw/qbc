import { ParseTree, ParseTreeWalker, Token } from "antlr4ng";
import { Typer } from "./Typer.ts";
import { CodeGenerator } from "./CodeGenerator.ts";
import { SymbolTable } from "./SymbolTable.ts";
import { UserDefinedType, } from "./Types.ts";
import { Statement } from "./statements/Statement.ts";
import { Procedure } from "./Procedures.ts";

export interface Program {
  chunks: ProgramChunk[];
  types: Map<string, UserDefinedType>;
}

export interface TargetRef {
  label: string;
  token: Token;
}

export interface ProgramChunk {
  statements: Statement[];
  indexToTarget: [number, TargetRef][];
  labelToIndex: Map<string, number>;
  symbols: SymbolTable;
  procedure?: Procedure;
}

export function compile(tree: ParseTree): Program {
  const typer = new Typer();
  ParseTreeWalker.DEFAULT.walk(typer, tree);
  const codeGenerator = new CodeGenerator(typer.program);
  ParseTreeWalker.DEFAULT.walk(codeGenerator, tree);
  return codeGenerator.program;
}