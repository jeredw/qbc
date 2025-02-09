import { TypeTag } from "./Types.ts";
import { ExprContext } from "../build/QBasicParser.ts";
import { Statement } from "./statements/Statement.ts";
import { Variable } from "./Variables.ts";
import { Token } from "antlr4ng";
import * as statements from "./statements/StatementRegistry.ts";

export interface Builtin {
  name: string;
  returnType?: TypeTag;
  statement: (token: Token, params: ExprContext[], result?: Variable) => Statement;
}

export class StandardLibrary {
  builtins: Map<string, Builtin> = new Map();

  constructor() {
    this.add({
      name: "abs",
      returnType: TypeTag.NUMERIC,
      statement: statements.abs,
    });
  }

  private add(builtin: Builtin) {
    this.builtins.set(builtin.name, builtin);
  }

  lookup(name: string): Builtin | undefined {
    return this.builtins.get(name.toLowerCase());
  }
}