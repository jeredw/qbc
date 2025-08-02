' Bug: Treat hanging newline as being in column 1.
cls
screen 0
locate 1, 80: print "q";
l = csrlin: p = pos(0)
print l, p