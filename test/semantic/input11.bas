' Bug: Do not skip leading fields.
open "test.txt" for output as #1
print #1, ",42"
close #1
open "test.txt" for input as #1
input #1, a%
input #1, b%
print a%; b%
close #1