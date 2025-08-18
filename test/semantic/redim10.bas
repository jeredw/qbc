' redim with incompatible type for as typed array not allowed.
'$DYNAMIC
dim f(20) as integer
redim f$(30)
print "nope"