type point
x as integer
y as integer
end type

dim global as point

sub foo
  shared global as point
  global.x = 42
  global.y = 42
end sub

foo
print global.x, global.y