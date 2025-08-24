import { ParseTree, ParseTreeWalker, Token } from "antlr4ng";
import { Typer } from "./Typer.ts";
import { CodeGenerator } from "./CodeGenerator.ts";
import { QBasicSymbol, SymbolTable } from "./SymbolTable.ts";
import { UserDefinedType, } from "./Types.ts";
import { Statement } from "./statements/Statement.ts";
import { Procedure } from "./Procedures.ts";
import { StandardLibrary } from "./Builtins.ts";
import { ParseError, RuntimeError } from "./Errors.ts";

export interface Program {
  chunks: ProgramChunk[];
  types: Map<string, UserDefinedType>;
  staticSize: number;
  data: DataItem[];
  debugInfo: DebugInfo;
}

export interface DataItem {
  // If text is absent, item is empty (e.g. DATA ,).
  text?: string;
  quoted?: boolean;
}

export interface SymbolRef {
  symbol: QBasicSymbol;
  token: Token;
}

export interface DebugInfo {
  refs: SymbolRef[];
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
  SymbolTable._symbolIndex = 0x0100;
  const builtins = new StandardLibrary();
  const typer = new Typer(builtins);
  try {
    ParseTreeWalker.DEFAULT.walk(typer, tree);
  } catch (error: unknown) {
    if (error instanceof ParseError) {
      throw error;
    }
    throw ParseError.internalError(typer.lastToken, error);
  }
  const codeGenerator = new CodeGenerator(typer.program, typer.arrayBaseIndex);
  try {
    ParseTreeWalker.DEFAULT.walk(codeGenerator, tree);
  } catch (error: unknown) {
    if (error instanceof ParseError) {
      throw error;
    }
    throw ParseError.internalError(codeGenerator.lastToken, error);
  }
  return codeGenerator.program;
}