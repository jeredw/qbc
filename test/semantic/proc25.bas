' Test passing record element references between subs
type record
  x as integer
  y as integer
end type

sub bar(x as integer, y as integer)
  ' Should set r.x and r.y
  x = 42
  y = 42
end sub

sub foo(r as record)
  bar r.x, r.y
end sub

dim r as record
foo r
print r.x, r.y