import { Token } from "antlr4ng";
import { Variable } from "./Variables.ts"

export interface Procedure {
  name: string;
  parameters: Variable[];
  result?: Variable;
  programChunkIndex: number;
  token: Token;
  hasBody?: boolean;
}