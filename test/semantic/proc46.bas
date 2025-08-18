' Procedure parameters can shadow constants.
const bar = 10
sub foo(bar)
  print bar
end sub
foo 42