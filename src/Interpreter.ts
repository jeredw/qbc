import { QBasicLexer } from "../build/QBasicLexer.ts";
import { QBasicParser } from "../build/QBasicParser.ts";
import { ExpressionListener } from "./ExpressionListener.ts";
import {
  CharStream,
  CommonTokenStream,
  ParseTreeWalker,
} from "antlr4ng";
import { StatementChunker } from "./StatementChunker.ts";

export class Interpreter {
  expressionListener = new ExpressionListener();

  public run(text: string) {
    // Add a trailing newline so the final statement has a terminator.
    const textWithNewline = text.endsWith('\n') ? text : text + '\n';
    const inputStream = CharStream.fromString(textWithNewline);
    const lexer = new QBasicLexer(inputStream);
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new QBasicParser(tokenStream);
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