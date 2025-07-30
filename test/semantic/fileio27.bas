' Test legacy OPEN syntax.
open "O", #1, "test.txt"
print #1, "ok"
close #1
open "I", #1, "test.txt"
line input #1, s$
print s$
close #1