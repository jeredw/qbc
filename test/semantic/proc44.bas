' Procedure parameters can shadow shared global arrays.
dim shared global%(20)
sub foo(global%())
  global%(0) = 42
end sub
dim x%(20)
foo x%()
print x%(0), global%(0)