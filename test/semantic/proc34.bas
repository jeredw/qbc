' Duplicate variables in parameter list result in "duplicate definition"
sub f(x, x)
  print x
end sub
f 1, 2