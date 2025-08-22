' Detect local variables possibly aliasing record element names.
type test
  x as integer
end type
dim r as test
sub foo
  ' This is not allowed.
  dim r.x as string
end sub