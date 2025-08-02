' Test that the screen scrolls when printing after a hanging newline.
screen 0
view print
print "this should scroll away"
locate 25, 80: print "2";
print "4";