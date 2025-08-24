' If you fill a line and don't newline, the print position stays at column 81.
' csrlin and pos return 2, 1 instead of 1, 81.  If you actually try to move to
' row 2 and print, there is an extra newline first.
cls
screen 0
print string$(80, "-");
r = csrlin: c = pos(0)
locate 2: print "h"
print r, c