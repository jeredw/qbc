' Local can't shadow a global constant defined later.
sub foo
  dim k
end sub
const k = 42