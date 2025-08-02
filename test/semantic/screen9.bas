' Bug: fix typo in screen() mixing up row and column.
cls
screen 0
print "hello";
print chr$(screen(csrlin, pos(1)-1))
print "!";
print chr$(screen(csrlin, pos(1)-1))