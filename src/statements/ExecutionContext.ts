import { Devices } from "../Devices";
import { SymbolTable } from "../SymbolTable";

export interface ExecutionContext {
  symbols: SymbolTable;
  devices: Devices;
}