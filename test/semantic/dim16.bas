' Local variables must follow the AS type of a shared global with the same name.
dim shared x as integer
sub foo
  ' AS clause required.
  dim x%
end sub
print "nope"