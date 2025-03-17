open "test.txt" for output as #1
print #1, "hello there"
print #1, "this is a test"
close #1
open "test.txt" for input as #1
print seek(1)
line input #1, a$
print seek(1), a$
seek #1, 1
print seek(1)
line input #1, a$
print seek(1), a$
close #1