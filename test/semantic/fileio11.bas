open "test.txt" for random as #1
field #1, 10 as entire$
field #1, 5 as lpart$, 5 as rpart$
print len(entire$), len(lpart$), len(rpart$)
lset entire$ = "hello world"
print "lset", entire$, lpart$, rpart$
mid$(lpart$, 1, 1) = "y"
print "mid", entire$, lpart$, rpart$
rset rpart$ = "mom"
print "rset", entire$, lpart$, rpart$
put #1, 1
lset entire$ = ""
lset lpart$ = ""
lset rpart$ = ""
print "lset", entire$, lpart$, rpart$
get #1, 1
print "get", entire$, lpart$, rpart$
close #1
print "post-close", entire$, lpart$, rpart$