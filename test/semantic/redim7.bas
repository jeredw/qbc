' redim doesn't require an explicit as type.
'$DYNAMIC
dim f(20) as integer
redim f(30)
print ubound(f), ubound(f%)