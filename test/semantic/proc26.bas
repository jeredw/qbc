' Test passing stack record element references between subs
type record
  x as integer
  y as integer
end type

sub bar(x as integer, y as integer)
  ' Should set r.x and r.y
  x = 42
  y = 42
end sub

sub foo()
  dim r as record
  bar r.x, r.y
  print r.x, r.y
end sub

foo