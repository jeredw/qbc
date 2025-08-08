import { MemoryDrive } from "../src/Disk.ts";
import { ParseError, RuntimeError } from "../src/Errors.ts";
import { Interpreter } from "../src/Interpreter.ts";
import { TestPrinter } from "../src/Printer.ts";
import { TestScreen } from "../src/Screen.ts";
import { TestSpeaker } from "../src/Speaker.ts";
import { KeyboardListener, typeLines } from "../src/Keyboard.ts";
import { TestTimer } from "../src/Timer.ts";
import { TestJoystick } from "../src/Joystick.ts";
import { PointerListener } from "../src/LightPen.ts";
import { Canvas, createCanvas, registerFont } from "canvas"
import { HttpModem, TestFetcher } from "../src/Modem.ts";
import { Invoker } from "../src/Invocation.ts";
import { MouseListener } from "../src/Mouse.ts";
import { SoundBlaster } from "../src/SoundBlaster.ts";
import { CommonData } from "../src/CommonData.ts";

async function interpret(program: string, input: string[], diskJson: string, commonJson: string): Promise<[string, string | undefined]> {
  try {
    const screen = new TestScreen(new class CanvasProvider {
      createCanvas(width: number, height: number) {
        return createCanvas(width, height) as unknown as HTMLCanvasElement;
      }
    });
    const speaker = new TestSpeaker();
    const printer = new TestPrinter();
    const disk = new MemoryDrive();
    const keyboard = new KeyboardListener();
    const timer = new TestTimer();
    const joystick = new TestJoystick();
    const lightPen = new PointerListener(screen);
    const modem = new HttpModem(
      new TestFetcher(new Map([['/test', 'Here is some data']])),
      true,  // respondInstantly
    );
    const mouse = new MouseListener(screen);
    const blaster = new SoundBlaster(speaker);
    let invocations = '';
    const interpreter = new Interpreter({
      screen,
      speaker,
      printer,
      disk,
      keyboard,
      timer,
      joystick,
      lightPen,
      modem,
      mouse,
      blaster,
    }, new class implements Invoker {
      runProgram(fileName: string, common?: CommonData) {
        if (fileName.toLowerCase() == 'error') {
          throw new Error('thrown error during runProgram');
        }
        if (common) {
          invocations += `COMMON ${common.toJson()}\n`
        }
        invocations += `RUN ${fileName}\n`;
      }
      restartProgram(statementIndex?: number) {
        invocations += `RUN ${statementIndex ?? 0}\n`;
      }
    });
    typeLines(input, keyboard);
    if (diskJson) {
      disk.loadFromJson(diskJson);
    }
    const common = commonJson ? CommonData.fromJson(commonJson) : undefined;
    const invocation = interpreter.run(program + '\n', common);
    await invocation.restart();
    let graphics: string | undefined;
    if (screen.hasGraphics) {
      const canvas = screen.graphics.renderVisiblePage() as unknown as Canvas;
      graphics = await Deno.makeTempFile({ suffix: '.png' });
      const buffer = canvas.toBuffer('image/png');
      await Deno.writeFileSync(graphics, buffer);
    }
    const text = [
      screen.text.output,
      prefixLines("LPT1> ", printer.output),
      speaker.output,
      disk.modified ? prefixLines("FS> ", disk.saveToJson()) : '',
      invocations
    ].join('');
    return [text, graphics];
  } catch (e: unknown) {
    if (e instanceof ParseError) {
      return [`ERROR ${e.location.line}:${e.location.column} ${e.message}`, undefined];
    } else if (e instanceof RuntimeError) {
      return [`RUNTIME ERROR ${e.location.line}:${e.location.column} ${e.message}`, undefined];
    } else {
      throw e;
    }
  }
}

async function previewImage(path: string) {
  const openCommand = new Deno.Command('open', { args: [path] });
  const child = openCommand.spawn();
  await child.status;
}

function prefixLines(prefix: string, output: string): string {
  return output ? output.split('\n').map((line) => `${prefix}${line}`).join('\n') : output;
}

async function runTests(tests: string[]) {
  for (const testPath of tests) {
    try {
      const goldenPath = testPath + '.output';
      const graphicsGoldenPath = testPath + '.png';
      const program = Deno.readTextFileSync(testPath);
      let input = [];
      try {
        input = Deno.readTextFileSync(testPath + '.input').split('\n');
      } catch {
        // Assume no keyboard input.
      }
      let diskJson = "";
      try {
        diskJson = Deno.readTextFileSync(testPath + '.disk');
      } catch {
        // Assume no disk image.
      }
      let commonJson = "";
      try {
        commonJson = Deno.readTextFileSync(testPath + '.common');
      } catch {
        // Assume no common variables.
      }
      const [outputText, graphics] = await interpret(program, input, diskJson, commonJson);
      const diffCommand = new Deno.Command('diff', {
        args: ['-du', goldenPath, '-'],
        stdin: 'piped',
        stdout: 'piped',
        stderr: 'piped'
      });
      const child = diffCommand.spawn();
      const writer = child.stdin.getWriter();
      await writer.write(new TextEncoder().encode(outputText));
      writer.releaseLock();
      try {
        await child.stdin.close();
      } catch {
        // XXX Sometimes it's randomly closed already...
      }
      const result = await child.output();
      const stdout = new TextDecoder().decode(result.stdout);
      const stderr = new TextDecoder().decode(result.stderr);
      if (!stdout && !stderr && !graphics) {
        console.log(`${testPath} pass`);
        continue;
      }
      if (stderr) {
        console.log(`${testPath} missing golden`);
        console.log(outputText);
      } else if (stdout) {
        console.log(`${testPath} diff`);
        console.log(stdout);
      }
      if (stderr || stdout) {
        if (confirm('gild?')) {
          Deno.writeTextFileSync(goldenPath, outputText);
        }
      }
      if (graphics) {
        const imgdiffCommand = new Deno.Command('compare', {
          args: ['-metric', 'MAE', graphics, graphicsGoldenPath, '/tmp/diff.png'],
          stdin: 'piped',
          stdout: 'piped',
          stderr: 'piped'
        });
        const child = imgdiffCommand.spawn();
        const result = await child.output();
        const stderr = new TextDecoder().decode(result.stderr);
        let shouldPrompt = false;
        if (stderr && stderr.includes("unable to open image")) {
          console.log(`${testPath} missing golden image`);
          await previewImage(graphics);
          shouldPrompt = true;
        } else if (stderr && stderr !== '0 (0)') {
          console.log(stderr);
          await previewImage('/tmp/diff.png');
          shouldPrompt = true;
        }
        if (shouldPrompt) {
          if (confirm('image ok?')) {
            Deno.rename(graphics, graphicsGoldenPath);
          }
        } else {
          console.log(`${testPath} pass`);
        }
      }
    } catch (err: unknown) {
      console.log(`${testPath} errors\n${err}`);
    }
  }
}

registerFont('www/WebPlus_IBM_VGA_9x16.woff', { family: 'Web IBM VGA 9x16' });
registerFont('www/WebPlus_IBM_VGA_9x8.woff', { family: 'Web IBM VGA 9x8' });
registerFont('www/WebPlus_IBM_VGA_8x14.woff', { family: 'Web IBM VGA 8x14' });
registerFont('www/WebPlus_IBM_VGA_8x16.woff', { family: 'Web IBM VGA 8x16' });
registerFont('www/WebPlus_IBM_EGA_8x8.woff', { family: 'Web IBM EGA 8x8' });
runTests(Deno.args);
