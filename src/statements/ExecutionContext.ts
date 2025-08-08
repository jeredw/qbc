import { Devices } from "../Devices.ts";
import { Memory } from "../Memory.ts";
import { ProgramData } from "../ProgramData.ts";
import { Files } from "../Files.ts";
import { Events } from "../Events.ts";
import { RandomNumbers } from "../RandomNumbers.ts";
import { ErrorHandling } from "../Errors.ts";
import { CommonData } from "../CommonData.ts";

export interface ExecutionContext {
  devices: Devices;
  memory: Memory;
  data: ProgramData;
  files: Files;
  events: Events;
  errorHandling: ErrorHandling;
  random: RandomNumbers;
  common: CommonData;
}