' Local variables can't shadow a procedure name.
sub bar: end sub
sub foo
  ' Duplicate definition
  bar = 2
end sub