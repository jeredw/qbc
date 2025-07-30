' Test that local scalars can shadow global arrays of a different type.
common shared a$()
sub foo
  dim a$(5)
  a$(0) = "*****"
  for a = 1 to 4
    print a; a$(0)
  next a
end sub
foo