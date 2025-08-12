' Test that chr$'s argument is an integer.
on error goto check
s$ = chr$(&h7fff)      ' Illegal function (out of range int)
s$ = chr$(&h7fff + 1)  ' Overflow (function takes an int).
end
check:
print "ok"; err
resume next