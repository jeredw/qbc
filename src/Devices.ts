import { TextScreen } from "./Screen.ts";
import { Speaker } from "./Speaker.ts";
import { Printer } from "./Printer.ts";
import { Disk } from "./Disk.ts";
import { Keyboard } from "./Keyboard.ts";
import { Timer } from "./Timer.ts";
import { Joystick } from "./Joystick.ts";
import { LightPen } from "./LightPen.ts";

export interface Devices {
  textScreen: TextScreen;
  speaker: Speaker;
  printer: Printer;
  disk: Disk;
  keyboard: Keyboard;
  timer: Timer;
  joystick: Joystick;
  lightPen: LightPen;
}