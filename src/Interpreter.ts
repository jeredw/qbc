import { QBasicLexer } from "../build/QBasicLexer.ts";
import { Do_loop_statementContext, QBasicParser } from "../build/QBasicParser.ts";
import { ExpressionListener } from "./ExpressionListener.ts";
import {
  ATNSimulator,
  BaseErrorListener,
  CharStream,
  CommonTokenStream,
  ParseTreeWalker,
  RecognitionException,
  Recognizer,
  Token,
} from "antlr4ng";
import { ParseError } from "./Errors.ts";
import { StatementChunker } from "./StatementChunker.ts";

export class Interpreter {
  expressionListener = new ExpressionListener();

  public run(text: string) {
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
    const statementChunker = new StatementChunker();
    ParseTreeWalker.DEFAULT.walk(statementChunker, tree);
    statementChunker.checkAllTargetsDefined();
    for (const statement of statementChunker.statements) {
      console.log(statement);
      ParseTreeWalker.DEFAULT.walk(new ExpressionListener(), statement);
    }
    
    //console.log(this.expressionListener.getResult());
  }
}

// Throw an error that will be displayed in the shell.
class ParseErrorListener extends BaseErrorListener {
  public override syntaxError<T extends ATNSimulator>(
    recognizer: Recognizer<T> | null,
    offendingSymbol: unknown,
    line: number,
    charPositionInLine: number,
    antlrMessage: string | null,
    antlrError: RecognitionException | null): void {
    const token = offendingSymbol as Token;
    const message = antlrMessage || "Parse error";
    if (/^missing ID at /.test(message)) {
      throw new ParseError(token, "Expected: identifier");
    }
    const mismatchedInput = message.match(/^mismatched input ([^ ]+) expecting (.*)$/);
    if (mismatchedInput && mismatchedInput[2]) {
      const expecting = mismatchedInput[2];
      if (expecting.startsWith("{'\(', '\-', '\+'")) {
        throw new ParseError(token, "Expected: expression");
      }
      switch (expecting) {
        case "{NEXT, NEXT_WITH_MANDATORY_ID}": 
          throw new ParseError(antlrError!.ctx!.start!, "FOR without NEXT");
        case "WEND":
          throw new ParseError(antlrError!.ctx!.start!, "WHILE without WEND");
        case "ID":
          // Non-variable cases are probably "missing ID".
          throw new ParseError(token, "Expected: variable");
        default:
          throw new ParseError(token, `Expected: ${expecting}`);
      }
    }
    if (/^no viable alternative at input/.test(message)) {
      console.error(antlrMessage);
      if (antlrError?.ctx instanceof Do_loop_statementContext) {
        throw new ParseError(antlrError!.ctx!.start, "DO without LOOP");
      }
    }
    throw new ParseError(token, message);
  }
}