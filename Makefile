build/qbasicParser.java: src/qbasic.g4
	mkdir -p build
	(cd src && antlr -Werror qbasic.g4 -o ../build)
	(cd build && javac *.java)

.PHONY: test
test: build/qbasicParser.java
	(cd build && grun qbasic program -tree ../test/labels.bas)
	(cd build && grun qbasic program -tree ../test/comments.bas)

.PHONY: clean
clean:
	rm -rf build