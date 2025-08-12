' Test that len() returns an integer.
s$ = "h"
print len(s$) + &h7fff  ' Should overflow.