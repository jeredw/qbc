' Test that next falls out of a loop if we goto inside it and the
' loop counter is already initialized.
x = 1
goto 42
for x = 1 to 5
print x
42 if x > 5 then exit for
' This should fall through and we should just print "ok"
next x
print "ok"