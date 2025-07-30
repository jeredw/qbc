' Test that COMMON SHARED in a subroutine is a compile-time error.
sub foo
common shared x
end sub
print "nope"