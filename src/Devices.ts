import { Screen } from "./Screen.ts";
import { Speaker } from "./Speaker.ts";
import { Printer } from "./Printer.ts";
import { Disk } from "./Disk.ts";
import { Keyboard } from "./Keyboard.ts";
import { Timer } from "./Timer.ts";
import { Joystick } from "./Joystick.ts";
import { LightPen } from "./LightPen.ts";
import { Modem } from "./Modem.ts";

export interface Devices {
  screen: Screen;
  speaker: Speaker;
  printer: Printer;
  disk: Disk;
  keyboard: Keyboard;
  timer: Timer;
  joystick: Joystick;
  lightPen: LightPen;
  modem: Modem;
}