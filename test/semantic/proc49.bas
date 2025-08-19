' Procedure parameters can shadow constants defined later.
sub foo(bar)
  print bar
end sub
const bar = 10
foo 42