import { TextScreen } from "./Screen.ts";
import { Speaker } from "./Speaker.ts";
import { Printer } from "./Printer.ts";
import { Disk } from "./Disk.ts";
import { Keyboard } from "./Keyboard.ts";
import { Handle } from "./Files.ts";

export interface Devices {
  textScreen: TextScreen;
  speaker: Speaker;
  printer: Printer;
  disk: Disk;
  keyboard: Keyboard;
}

export interface Device {
  close(handle: Handle): void;
}