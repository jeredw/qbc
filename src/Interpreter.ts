import { QBasicLexer } from "../build/QBasicLexer.ts";
import { QBasicParser } from "../build/QBasicParser.ts";
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
    _e: RecognitionException | null): void {
    const token = offendingSymbol as Token;
    const message = antlrMessage || "Parse error";
    if (/^mismatched input ([^ ]+) expecting {NEXT, NEXT_WITH_MANDATORY_ID}/.test(message)) {
      throw new ParseError(_e!.ctx!.start!, "FOR without NEXT");
    }
    throw new ParseError(token, message);
  }
}