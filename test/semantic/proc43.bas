' Procedure parameters can shadow shared global scalars.
dim shared global%
sub foo(global%)
  global% = 42
end sub
foo x%
print x%, global%