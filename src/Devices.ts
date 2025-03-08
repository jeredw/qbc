import { TextScreen } from "./Screen.ts";
import { Speaker } from "./Speaker.ts";
import { Printer } from "./Printer.ts";

export interface Devices {
  textScreen: TextScreen;
  speaker: Speaker;
  printer: Printer;
}