' Bug: input$ works in binary mode
open "test.txt" for output as #1
print #1, "hello world"
close #1
open "test.txt" for binary as #1
print input$(5, 1)
close #1