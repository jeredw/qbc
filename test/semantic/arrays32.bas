' Bug: implicitly defined arrays are illegal in stack procedures.
sub foo
  x%(0) = 42
end sub
foo