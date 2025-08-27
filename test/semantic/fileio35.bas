' Test that input # from random access files errors.
open "test.dat" for output as #1
print #1, 0
close #1
open "test.dat" for random as #1
input #1, stuff%
close #1