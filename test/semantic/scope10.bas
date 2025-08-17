' Bug: common followed by dim shared should share a variable.
common x()
dim shared x(10)
sub foo
  ' Should print 0.  If x were not shared, this would be illegal
  ' because implicit arrays are not allowed in stack procedures.
  print x(5)
end sub
foo