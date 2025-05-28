type point
x as integer
y as integer
end type

dim global(20) as point

sub foo
  shared global() as point
  global(20).x = 42
  global(20).y = 42
end sub

foo
print global(20).x, global(20).y