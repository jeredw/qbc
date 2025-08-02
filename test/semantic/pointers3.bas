' Test that VARPTR gets an offset from an array index.
' $DYNAMIC
dim a%(20)
sub foo(x%())
  print varptr(x%(10))
end sub
foo a%()