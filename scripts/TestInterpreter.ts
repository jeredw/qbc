import { ParseError } from "../src/Errors.ts";
import { Interpreter } from "../src/Interpreter.ts";
import { TestTextScreen } from "../src/Screen.ts";

async function interpret(text: string): Promise<string> {
  try {
    const textScreen = new TestTextScreen();
    const interpreter = new Interpreter({textScreen});
    const invocation = interpreter.run(text);
    await invocation.restart();
    return textScreen.output;
  } catch (e: unknown) {
    if (e instanceof ParseError) {
      return `ERROR ${e.location.line}:${e.location.column} ${e.message}`;
    } else {
      throw e;
    }
  }
}

async function runTests(tests: string[]) {
  for (const testPath of tests) {
    try {
      const goldenPath = testPath + '.output';
      const input = Deno.readTextFileSync(testPath);
      const output = await interpret(input);
      const diffCommand = new Deno.Command('diff', {
        args: ['-du', goldenPath, '-'],
        stdin: 'piped',
        stdout: 'piped',
        stderr: 'piped'
      });
      const child = diffCommand.spawn();
      const writer = child.stdin.getWriter();
      await writer.write(new TextEncoder().encode(output));
      writer.releaseLock();
      try {
        await child.stdin.close();
      } catch {
        // XXX Sometimes it's randomly closed already...
      }
      const result = await child.output();
      const stdout = new TextDecoder().decode(result.stdout);
      const stderr = new TextDecoder().decode(result.stderr);
      if (!stdout && !stderr) {
        console.log(`${testPath} pass`);
        continue;
      }
      if (stderr) {
        console.log(`${testPath} missing golden`);
        console.log(output);
      } else if (stdout) {
        console.log(`${testPath} diff`);
        console.log(stdout);
      }
      if (confirm('gild?')) {
        Deno.writeTextFileSync(goldenPath, output);
      }
    } catch (err: unknown) {
      console.log(`${testPath} errors\n${err}`);
    }
  }
}

runTests(Deno.args);
