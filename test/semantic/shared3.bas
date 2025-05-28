dim global%
sub foo
  shared global as integer
  global% = 42
end sub

foo
print global%