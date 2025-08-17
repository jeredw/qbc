' Test that float32 overflow is detected in the situations where QBasic would
' detect it.
print 3.402823e+38 + 1e31  ' Doesn't overflow.
print 2.802597e-45 / 3  ' Rounds to 0.
print 3.402823e+38 * 2  ' Overflow.