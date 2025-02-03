import { QBasicLexer } from "../build/QBasicLexer.ts";
import { QBasicParser } from "../build/QBasicParser.ts";
import {
  ATNSimulator,
  BaseErrorListener,
  CharStream,
  CommonTokenStream,
  Recognizer,
  RecognitionException,
  Token,
} from "antlr4ng";

class ThrowingErrorListener extends BaseErrorListener {
  override syntaxError<S extends Token, T extends ATNSimulator>(_recognizer: Recognizer<T>, offendingSymbol: S | null, line: number, column: number, msg: string, _e: RecognitionException | null): void {
    throw `${line}:${column} ${offendingSymbol}: ${msg}`;
  }
}

function parseProgram(text: string) {
  const textWithNewline = text.endsWith('\n') ? text : text + '\n';
  const inputStream = CharStream.fromString(textWithNewline);
  const lexer = new QBasicLexer(inputStream);
  lexer.removeErrorListeners();
  lexer.addErrorListener(new ThrowingErrorListener());
  const tokenStream = new CommonTokenStream(lexer);
  const parser = new QBasicParser(tokenStream);
  parser.removeErrorListeners();
  parser.addErrorListener(new ThrowingErrorListener());
  const tree = parser.program();
  return tree.toStringTree(parser);
}

function prettyPrint(tree: string): string {
  const output: string[] = [];
  let depth = 0;
  for (let i = 0; i < tree.length; i++) {
    const ch = tree.charAt(i);
    if (ch == '(') {
      if (depth > 0) {
        output.push('\n');
        output.push(' '.repeat(depth * 2));
      }
      depth += 1;
    } else if (ch == ')') {
      depth -= 1;
    }
    output.push(ch);
  }
  output.push('\n');
  return output.join('');
}

async function runTests(tests: string[]) {
  for (const testPath of tests) {
    try {
      const goldenPath = testPath + '.tree';
      const input = Deno.readTextFileSync(testPath);
      const output = prettyPrint(parseProgram(input));
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
