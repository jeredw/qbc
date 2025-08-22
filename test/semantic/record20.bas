' Detect constant names potentially aliasing record element names.
type test
  x as integer
end type
const r.x = 42
sub foo
  dim r as test
end sub