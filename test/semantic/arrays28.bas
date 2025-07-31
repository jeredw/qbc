' Bug: Ok to redim an array parameter if it is dynamic at runtime.
' $DYNAMIC
dim x(1)
sub foo (a())
redim a(100)
end sub
foo x()
print "ok"; ubound(x)