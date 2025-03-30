open "test.txt" for random as #1
field #1, 10 as entire$
lset entire$ = "hello world"
put #1
close #1
open "test.txt" for random as #2
' field after get should get most recent
get #2
field #2, 10 as entire$
field #2, 5 as lpart$, 5 as rpart$
print entire$, lpart$, rpart$
close #2