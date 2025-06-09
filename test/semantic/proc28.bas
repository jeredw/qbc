' Pass stack references between subs.
sub f2(i%): print i%: end sub
sub f1(i%): f2 i%: end sub
f1 42