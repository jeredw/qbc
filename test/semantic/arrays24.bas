' Implicitly dimensioned arrays are allowed in static procedures.
sub foo static
  print x(1)
  x(1) = 42
end sub

foo
foo