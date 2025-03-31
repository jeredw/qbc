open "test.txt" for random as #1 len=4
x$ = "****"
put #1, 1, x$
get #1, 1, y$
print x$, y$
close #1