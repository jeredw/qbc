' Local array can shadow a global constant.
const k = 42
sub foo
  dim k(2)
end sub