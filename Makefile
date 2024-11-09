parser: src/qbasic.g4
	mkdir -p build
	(cd src && antlr -Werror qbasic.g4 -o ../build)
	(cd build && javac *.java)

.PHONY: test
test: parser
	(cd build && grun qbasic program -tree ../test/labels.bas)

.PHONY: clean
clean:
	rm -rf build