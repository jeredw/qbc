' In this case we fill a line with newline.  The print cursor really wraps
' to 2, 1 and we print in row 2, 1.
cls
screen 0
print string$(80, "-")
r = csrlin: c = pos(0)
locate 2: print "h"
print r, c