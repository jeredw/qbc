import { ParserRuleContext } from "antlr4ng";
import { QBasicSymbol } from "./SymbolTable.ts";
import { Procedure } from "./Procedures.ts";
import { Builtin } from "./Builtins.ts";
import { Constant } from "./Values.ts";
import { Variable } from "./Variables.ts";

export interface TyperContext {
  $symbol: QBasicSymbol;
  $procedure: Procedure;
  $builtin: Builtin;
  $constant: Constant;
  // Synthetic result variable for a function call, builtin, or array element
  // lookup lifted from an expression.
  $result: Variable;
  // Saved "TO" expression value for a for loop.
  $end: Variable;
  // Saved "STEP" expression value for a for loop.
  $increment: Variable;
  // Saved test expression for select case.
  $test: Variable;
  // Late bound procedure when CALLing an unknown procedure.
  $procedureName: string;
}

export interface CodeGeneratorContext {
  // Generated label for this statement.
  $label: string;
  // Label for the next branch of an if/select.
  $nextBranchLabel: string;
  // Top of block (loops).
  $topLabel: string;
  // End of block (end if/loop exit).
  $exitLabel: string;
  // Set to avoid redundant function calls when compiling nested call expressions.
  $compiled: boolean;
}

export function getTyperContext(ctx: ParserRuleContext): TyperContext {
  return ctx as unknown as TyperContext;
}

export function getCodeGeneratorContext(ctx: ParserRuleContext): CodeGeneratorContext {
  return ctx as unknown as CodeGeneratorContext;
}