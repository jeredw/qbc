#!/bin/bash
mkdir -p build
antlr4ng -Dlanguage=TypeScript -listener -Xexact-output-dir -Werror src/QBasicLexer.g4 -o build
antlr4ng -Dlanguage=TypeScript -listener -Xexact-output-dir -Werror src/QBasicParser.g4 -o build
tsc
node ./scripts/build.js