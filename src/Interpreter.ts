import { QBasicLexer } from "../build/QBasicLexer.ts";
import { Do_loop_statementContext, QBasicParser } from "../build/QBasicParser.ts";
import {
  ATNSimulator,
  BaseErrorListener,
  CharStream,
  CommonTokenStream,
  RecognitionException,
  Recognizer,
  Token,
} from "antlr4ng";
import { ParseError } from "./Errors.ts";
import { compile } from "./Programs.ts";
import { Invocation, invoke } from "./Invocation.ts";
import { Devices } from "./Devices.ts";
import { Memory } from "./Memory.ts";

export class Interpreter {
  private devices: Devices;

  constructor(devices: Devices) {
    this.devices = devices;
  }

  public run(text: string): Invocation {
    // Add a trailing newline so the final statement has a terminator.
    const textWithNewline = text.endsWith('\n') ? text : text + '\n';
    const inputStream = CharStream.fromString(textWithNewline);
    const lexer = new QBasicLexer(inputStream);
    const parseErrorListener = new ParseErrorListener();
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new QBasicParser(tokenStream);
    lexer.removeErrorListeners();
    lexer.addErrorListener(parseErrorListener);
    parser.removeErrorListeners();
    parser.addErrorListener(parseErrorListener);
    // Parse the program first to check correct syntax.
    const tree = parser.program();
    const program = compile(tree);
    return invoke(this.devices, new Memory(program.staticSize), program);
  }
}

// Throw an error that will be displayed in the shell by hackily rewriting ANTLR
// error messages.  ANTLR's errors are decent, but nowhere near as nice as we
// could get with a handwritten parser... we may want to just switch it out for
// a handwritten parser eventually.
class ParseErrorListener extends BaseErrorListener {
  public override syntaxError<T extends ATNSimulator>(
    recognizer: Recognizer<T> | null,
    offendingSymbol: unknown,
    line: number,
    charPositionInLine: number,
    antlrMessage: string | null,
    antlrError: RecognitionException | null): void {
    const message = antlrMessage || "Parse error";
    if (offendingSymbol == null) {
      if (/^token recognition error at: '"/.test(message)) {
        throw ParseError.fromLineAndPosition(line, charPositionInLine, `missing '"'`);
      }
      throw ParseError.fromLineAndPosition(line, charPositionInLine, message);
    }
    const token = offendingSymbol as Token;
    if (/^missing ID at /.test(message)) {
      throw ParseError.fromToken(token, "Expected: identifier");
    }
    const mismatchedInput = message.match(/^mismatched input ([^ ]+) expecting (.*)$/);
    if (mismatchedInput && mismatchedInput[2]) {
      const expecting = mismatchedInput[2];
      if (expecting.startsWith("{'\(', '\-', '\+'")) {
        throw ParseError.fromToken(token, "Expected: expression");
      }
      switch (expecting) {
        case "{NEXT, NEXT_WITH_MANDATORY_ID}": 
          throw ParseError.fromToken(antlrError!.ctx!.start!, "FOR without NEXT");
        case "WEND":
          throw ParseError.fromToken(antlrError!.ctx!.start!, "WHILE without WEND");
        case "LOOP":
          throw ParseError.fromToken(antlrError!.ctx!.start!, "DO without LOOP");
        case "ID":
        case "{FNID, ID}":
          // Non-variable cases are probably "missing ID".
          throw ParseError.fromToken(token, "Expected: variable");
        default:
          throw ParseError.fromToken(token, `Expected: ${expecting}`);
      }
    }
    if (/^extraneous input ([^ ])+ expecting {COLON, NL}/.test(message)) {
      throw ParseError.fromToken(token, "Expecting: end-of-statement");
    }
    if (/^extraneous input 'else' expecting /.test(message)) {
      throw ParseError.fromToken(token, "ELSE without IF");
    }
    if (/^no viable alternative at input/.test(message)) {
      console.error(antlrMessage);
      if (antlrError?.ctx instanceof Do_loop_statementContext) {
        throw ParseError.fromToken(antlrError!.ctx!.start!, "DO without LOOP");
      }
    }
    throw ParseError.fromToken(token, message);
  }
}