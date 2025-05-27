screen 0
locate 3, 1: print "Hello"
view print 1 to 2
print "Orange"
locate 25, 1: print "yay";
' Should clear the view print region in green, and the status line.
color ,2
cls