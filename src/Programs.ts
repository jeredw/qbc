import { ParseTree, ParseTreeWalker, Token } from "antlr4ng";
import { Typer } from "./Typer.ts";
import { CodeGenerator } from "./CodeGenerator.ts";
import { SymbolTable } from "./SymbolTable.ts";
import { UserDefinedType, } from "./Types.ts";
import { Statement } from "./statements/Statement.ts";
import { Procedure } from "./Procedures.ts";
import { StandardLibrary } from "./Builtins.ts";

export interface Program {
  chunks: ProgramChunk[];
  types: Map<string, UserDefinedType>;
  staticSize: number;
  data: DataItem[];
}

export interface DataItem {
  // If text is absent, item is empty (e.g. DATA ,).
  text?: string;
  quoted?: boolean;
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
  stackSize: number;
}

export function compile(tree: ParseTree): Program {
  const builtins = new StandardLibrary();
  const typer = new Typer(builtins);
  ParseTreeWalker.DEFAULT.walk(typer, tree);
  const codeGenerator = new CodeGenerator(typer.program, typer.arrayBaseIndex);
  ParseTreeWalker.DEFAULT.walk(codeGenerator, tree);
  return codeGenerator.program;
}