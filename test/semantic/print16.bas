' Test that a hanging newline from the last cell of the screen does not
' immediately scroll.
screen 0
view print
print "this should not scroll away"
locate 25, 80: print "2";
l = csrlin: p = pos(0)
' This should print 25, 1.
locate 2, 1: print l, p