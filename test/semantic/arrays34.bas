' SHARED arrays should be treated as dynamic if they are.
sub foo
  shared x()
  redim x(50)
end sub
' $DYNAMIC
dim x(20)
foo
print ubound(x)