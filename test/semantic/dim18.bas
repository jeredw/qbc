' Local variables can't shadow a shared AS typed global even with the same type.
dim shared x as integer
sub foo
  ' Duplicate definition.
  dim x as integer
end sub
print "nope"