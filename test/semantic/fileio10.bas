open "test.txt" for output as #1
print fileattr(1, 1)
close #1
open "test.txt" for input as #1
print fileattr(1, 1)
close #1
open "test.txt" for random as #1
print fileattr(1, 1)
close #1
open "test.txt" for binary as #1
print fileattr(1, 1)
close #1
open "test.txt" for append as #1
print fileattr(1, 1)
close #1
open "test.txt" for append as #1
print fileattr(1, 2)
close #1