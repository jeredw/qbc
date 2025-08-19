' Local variables can't shadow a procedure name defined later.
sub foo
  ' Duplicate definition
  bar = 2
end sub
sub bar: end sub