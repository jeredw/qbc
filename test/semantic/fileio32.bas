' Test putting data into binary files.
open "test.dat" for output as #1
close #1
open "test.dat" for binary as #1
dim x as string * 8
x = string$(8, "x")
put #1, , x$
put #1, , x$
seek #1, 5
dim y as string * 4
y = string$(4, "y")
put #1, , y$
close #1
open "test.dat" for input as #1
line input #1, s$
print s$