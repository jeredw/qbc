' Test that val returns a double.
print atn(1)
' Even though val reads an integer here, it is typed as double
' at compile time, so atn returns double precision.
print atn(val("1"))