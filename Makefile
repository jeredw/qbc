build/qbasicParser.java: src/qbasic.g4
	mkdir -p build
	(cd src && antlr -Werror qbasic.g4 -o ../build)
	(cd build && javac *.java)

.PHONY: test
test: build/qbasicParser.java test/*.bas
	python3 src/test_parser.py test/*.bas

.PHONY: clean
clean:
	rm -rf build