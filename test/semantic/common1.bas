' Test that COMMON SHARED can declare a global scalar variable.
common shared x
sub foo
x = 42
end sub
print x
foo
print x