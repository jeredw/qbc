' Local variables can't shadow a shared AS typed global with a different type.
dim shared x as integer
sub foo
  ' Duplicate definition.
  dim x$
end sub
print "nope"