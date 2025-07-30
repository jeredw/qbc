' Test that local scalars can shadow global arrays of same type.
common shared x%()
sub foo
  x%(0) = 42
  for x% = 1 to 4
    print x%; x%(0)
  next x%
end sub
foo