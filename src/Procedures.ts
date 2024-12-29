import { Type } from "./Types.ts"
import { Variable } from "./Variables.ts"

export interface Procedure {
  name: string;
  returnType?: Type;
  staticStorage?: boolean;
  parameters: Variable[];
}