' Test accessing a COMMON SHARED array before it is dimensioned.
common shared x()
sub foo
dim x(10)
x(0) = 42
end sub
' This should error at runtime.
print x(0)
foo
print x(0)