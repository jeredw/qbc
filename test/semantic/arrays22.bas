' Static arrays are allocated as dynamic in non-static procedures.
sub foo
  static a()
  dim a(10)  ' Duplicate definition at runtime.
  print a(1)
  a(1) = 42
end sub

foo
foo