' Test eof for binary files.
open "test.dat" for output as #1
close #1
open "test.dat" for binary as #1
dim x as string * 4
x = string$(4, "x")
put #1, , x$
put #1, , x$
seek #1, 1
dim y as string * 8
get #1, , y$
' Not at eof even though we read the last byte of the file.
print eof(1)
' Now at eof because get did not have sufficient bytes.
get #1, , y$
print eof(1)
close #1