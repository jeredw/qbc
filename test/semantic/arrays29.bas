' Not ok to redim an array parameter if it is static at runtime.
' $STATIC
dim x(1)
sub foo (a())
redim a(100)
end sub
foo x()
print "nope"