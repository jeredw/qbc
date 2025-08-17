' REDIM of a dynamic array defined in a procedure works.
sub foo
  dim x(20)
  redim x(40)
  print ubound(x)
end sub

foo