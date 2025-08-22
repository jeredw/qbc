' Detect local variables possibly aliasing record element names.
type test
  x as integer
end type
sub foo
  dim r as test
end sub
' This is not allowed, even though r.x is not shared.
dim r.x as string