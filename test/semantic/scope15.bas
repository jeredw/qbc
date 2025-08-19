' Local variables can't shadow a global constant defined later.
sub foo
  ' Duplicate definition
  k = 42
end sub
const k = 2