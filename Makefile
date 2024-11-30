build/QBasicParser.ts: src/QBasicParser.g4 src/QBasicLexer.g4
	mkdir -p build
	antlr4ng -Dlanguage=TypeScript -listener -Xexact-output-dir -Werror src/QBasicLexer.g4 -o build
	antlr4ng -Dlanguage=TypeScript -listener -Xexact-output-dir -Werror src/QBasicParser.g4 -o build
	tsc

.PHONY: test
test: src/TestParser.ts build/QBasicParser.ts test/*/*.bas
	deno run --allow-write --allow-read --allow-run src/TestParser.ts test/{parser,manual,programs}/*.bas

.PHONY: clean
clean:
	rm -rf build

.PHONY: gettools
gettools:
	npm install antlr4ng
	npm install --save-dev antlr4ng-cli