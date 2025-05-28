dim global as integer
sub foo
  shared global%
  global% = 42
end sub

foo
print global%