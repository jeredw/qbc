build/QBasicParser.java: src/QBasicParser.g4 src/QBasicLexer.g4
	mkdir -p build
	(cd src && antlr -Werror QBasicLexer.g4 -o ../build)
	(cd src && antlr -Werror QBasicParser.g4 -o ../build)
	(cd build && javac *.java)

.PHONY: test
test: build/QBasicParser.java test/*.bas
	python3 src/test_parser.py test/*.bas

.PHONY: clean
clean:
	rm -rf build