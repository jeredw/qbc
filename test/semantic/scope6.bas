' Test that local scalars can shadow global scalars of a different type.
dim shared a$
sub foo
  a$ = "*****"
  for a = 1 to 4
    print a; a$
  next a
end sub
foo