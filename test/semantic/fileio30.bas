' Bug: In random access mode, PUT with a record offset should seek to the offset
' first, read the record there, and then overwrite the beginning.
open "test.txt" for random as #1
s$ = "this is record 1"
put #1, , s$
s$ = "this is record 2"
put #1, , s$
close #1

open "test.txt" for random as #1
s$ = "2222"
put #1, 2, s$
close #1