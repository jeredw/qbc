' Test that records cannot be passed by reference.
type thing
  x as integer
end type

sub foo(r as thing)
end sub

dim t as thing
' This should be a parameter type mismatch.
foo (t)