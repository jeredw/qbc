dim global(20)
sub foo
  shared global()
  global(20) = 42
end sub

foo
print global(20)