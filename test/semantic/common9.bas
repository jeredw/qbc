' Do not check number of dimensions for static arrays before common.
dim a(1, 1, 5)
common a()
' Make sure a() is not redeclared as dynamic.
print ubound(a, 3)