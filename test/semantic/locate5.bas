' Bug: Scroll when wrapping from >= last line.
cls
screen 0
' We are allowed to locate on the last line even if it's outside view print.
locate 25, 1
print "hello"
print "world"