' Bug: Multiple quoted string fields on a line, separate input statements.
open "test.txt" for output as #1
write #1, "name", "bob", "eyes", "blue"
close #1
open "test.txt" for input as #1
input #1, a$, b$
input #1, c$, d$
print a$, b$
print c$, d$
close #1