' Test that COMMON SHARED can declare a global array variable.
common shared x()
sub foo
dim x(10)
x(0) = 42
end sub
foo
print x(0)