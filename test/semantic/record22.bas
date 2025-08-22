' Detect procedure names potentially aliasing record element names.
type test
  x as integer
end type
sub r.x: end sub
sub foo
  dim r as test
end sub