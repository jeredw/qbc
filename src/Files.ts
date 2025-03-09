import { Device } from "./Devices.ts";
import { Printer } from "./Printer.ts";

export interface Handle {
  device: Device;
  data: unknown;
  printer?: Printer;
}

export interface Files {
  handles: Map<number, Handle>;
}