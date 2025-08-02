' Test that locate resets a pending scroll from a hanging newline.
screen 0
view print
print "this should not scroll away"
locate 25, 80: print "2";
locate 25, 1: print "4";