' Local variables can't shadow a shared global with the same type.
dim shared x%
sub foo
  ' Duplicate definition.
  dim x%
end sub
print "nope"