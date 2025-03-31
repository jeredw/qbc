open "test.txt" for binary as #1
x$ = "****"
put #1, 1, x$
y$ = "##"
get #1, 1, y$
print x$, y$
close #1