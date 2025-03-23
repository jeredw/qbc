open "test.txt" for output as #1
print #1, "  1 2 3"
print #1, "1, 2, 3"
print #1, "1 x 3"
print #1, "hello"
print #1, "world, 42"
print #1, "spaceballs the flame thrower"
print #1, chr$(34) + "curly:" + chr$(34) + chr$(34) + " moe, larry"
print #1, "  the cheese   "
close #1
open "test.txt" for input as #1
input #1, a, b, c
print a, b, c
input #1, a, b, c
print a, b, c
input #1, a, b, c
print a, b, c
input #1, a$, b$
print a$, b$
input #1, c
print c
input #1, a$
print a$
input #1, a$, b$
print a$, b$
close #1