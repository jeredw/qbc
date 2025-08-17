' Test that redim can be used to define a new dynamic array
' with no previous definition.
redim x(20)
x(10) = 42
print x(10), ubound(x)