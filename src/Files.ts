import { Device } from "./Devices.ts";

export interface Handle {
  device: Device;
  deviceHandle: Object;
}

export interface Files {
  handles: Map<number, Handle>;
}