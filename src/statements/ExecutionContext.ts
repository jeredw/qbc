import { Devices } from "../Devices.ts";
import { Memory } from "../Memory.ts";

export interface ExecutionContext {
  devices: Devices;
  memory: Memory;
}