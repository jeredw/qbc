' Test that local arrays can shadow global scalars of same type.
common shared x%
sub foo
  dim x%(10)
  x% = 42
  x%(0) = 1
  print x%(0); x%
end sub
foo