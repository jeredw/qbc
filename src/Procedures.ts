import { Type } from "./Types.ts"
import { Variable } from "./Variables.ts"

export interface Procedure {
  name: string;
  parameters: Variable[];
  programChunkIndex: number;
  returnType?: Type;
  staticStorage?: boolean;
}