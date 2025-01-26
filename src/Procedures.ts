import { Variable } from "./Variables.ts"

export interface Procedure {
  name: string;
  parameters: Variable[];
  result?: Variable;
  programChunkIndex: number;
  staticStorage?: boolean;
}