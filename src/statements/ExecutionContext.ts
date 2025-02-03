import { Devices } from "../Devices";
import { Memory } from "../Memory";

export interface ExecutionContext {
  devices: Devices;
  memory: Memory;
}