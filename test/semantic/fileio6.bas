open "test.txt" for output as #1
print #1, "hello there"
print #1, "this is a test"
close #1
open "test.txt" for input as #1
print eof(1)
line input #1, a$
print a$, eof(1)
line input #1, a$
print a$, eof(1)
close #1