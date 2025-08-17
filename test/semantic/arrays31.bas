' Bug: SHARED arrays should not be implicitly made dynamic.
sub foo
  shared x()
  ' Should fail with "Array already dimensioned".
  redim x(50)
end sub

dim x(20)
foo
print ubound(x)