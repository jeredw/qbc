open "test.txt" for output as #1
print #1, chr$(34) + "foo" + chr$(34);
print #1, "  ,  ";
print #1, "bar"
close #1
open "test.txt" for input as #1
input #1, a$, b$
print 1, 2
print a$, b$
close #1