' Can't shadow an as-typed array with an explicitly typed scalar.
dim x(10) as string
x% = 42  ' This is a duplicate definition.
print x%