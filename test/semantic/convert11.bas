' Test argument types for conversion functions.
on error goto check
a$ = mki$(&h7fff + 1)     ' Overflow
b$ = mkl$(&h7fffffff + 1) ' Overflow
end
check:
print "ok"; err
resume next