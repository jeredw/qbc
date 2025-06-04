open "foo.txt" for output as #1
open "bar.txt" for output as #2
open "baz.txt" for output as #3
open "quux.txt" for output as #4
print #1, "hi"
reset
open "foo.txt" for input as #1
close #1