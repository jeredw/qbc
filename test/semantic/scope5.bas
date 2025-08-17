' static declares static arrays just fine, but there is no way
' to allocate them.
sub test
  static foo()
  ' Errors with "Subscript out of range"
  foo(0) = foo(0) + 1
end sub
test
print "nope"