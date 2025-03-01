import { Devices } from "../Devices.ts";
import { Memory } from "../Memory.ts";
import { ProgramData } from "../ProgramData.ts";

export interface ExecutionContext {
  devices: Devices;
  memory: Memory;
  data: ProgramData;
}