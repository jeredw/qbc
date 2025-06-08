' Static arrays can be declared in non-static procedures...
sub foo
  static a() as integer
  print a(1)  ' Fails with "Subscript out of range"
end sub

foo