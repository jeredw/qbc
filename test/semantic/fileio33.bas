' Test eof for random access files.
open "test.dat" for output as #1
close #1
open "test.dat" for random as #1
dim s as string * 5
s$ = "hello"
put #1, , s$
put #1, , s$
seek #1, 1
dim t as string * 6
get #1, , t$
' Not at eof yet.
print eof(1)
get #1, , t$
' Now at eof because get did not have sufficient bytes.
print eof(1)
close #1