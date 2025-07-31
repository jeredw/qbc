' Bug: It is ok to shadow an as-typed array with an implicitly typed scalar.
dim x(10) as string
x = 42
print x