open "test.txt" for output as #1
print #1, "hello world"
close #1
open "test.txt" for input as #1
line input #1, s$
print s$
close #1