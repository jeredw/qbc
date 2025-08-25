' Test writing random access files with partial records.
open "test.dat" for output as #1
close #1
open "test.dat" for random as #1
dim x as string * 8
x = string$(8, "x")
put #1, , x$
put #1, , x$
seek #1, 1
dim y as string * 4
y = string$(4, "y")
put #1, , y$
close #1
' The file should have two records, the first yyyyxxxx, the second xxxxxxxx.
' The first record should be padded out to 128 bytes, but the final record
' should only be 8 bytes.