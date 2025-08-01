' Bug: Treat trailing . as empty extension
open "test" for output as #1
print #1, "hello"
close #1
open "test." for input as #1
line input #1, test$
close #1
print test$