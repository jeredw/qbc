' Local array can shadow a global constant defined later.
sub foo
  dim k(2)
end sub
const k = 42