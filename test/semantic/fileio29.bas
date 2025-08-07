' Bug: SEEK for random files takes a record number not a position
open "test.txt" for random as #1
seek #1, 2
s$ = "stuff"
put #1, , s$
close #1