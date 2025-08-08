' Bug: Do not skip delimiters for multiple input statements reading quoted
' strings on same line.
open "test.txt" for output as #1
write #1, "name", "bob", "eyes", "blue"
close #1
open "test.txt" for input as #1
input #1, a$, b$
input #1, c$, d$
print a$, b$
print c$, d$
close #1