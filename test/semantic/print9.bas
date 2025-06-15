' Test printing at all four corners of the screen without scrolling.
screen 0
cls
view print
locate 1, 1: print "1";
locate 1, 80: print "2";
locate 25, 1: print "3";
locate 25, 80: print "4";