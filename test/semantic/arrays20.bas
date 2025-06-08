' Dynamic arrays can be defined in static procedures.
sub foo(x%) static
  dim a$(x%)
  print ubound(a$)
end sub

foo 10