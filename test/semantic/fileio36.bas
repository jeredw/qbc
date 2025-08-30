' Test that accessing records updates seek position correctly.
open "test.dat" for output as #1
close #1
open "test.dat" for random as #1
put #1, , x
put #1, , y
print seek(1)  ' Now at 3
seek #1, seek(1) - 2
print seek(1)  ' Now at 1
get #1, , x
get #1, , y
print seek(1)  ' Now at 3
seek #1, seek(1) - 2
print seek(1)  ' Now at 1