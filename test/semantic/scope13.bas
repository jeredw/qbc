' Local variables can't shadow a global constant.
const k = 2
sub foo
  ' Duplicate definition
  k = 42
end sub