' Implicitly dimensioned arrays are not allowed in non-static procedures.
sub foo
  print x(1)  ' Compile-time error "Array not defined"
end sub

foo