' VIEW PRINT with no arguments is like VIEW PRINT 1 TO 25
cls
screen 0
view print
print "do not scroll"
locate 24, 80: print "|"
l = csrlin: p = pos(0)
locate 2, 1: print l, p