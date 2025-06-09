' Test passing stack record references between subs
type record
  x as integer
  y as integer
end type

sub bar(x as integer, y as integer)
  ' Should set r.x and r.y
  x = 42
  y = 42
end sub

sub baz(r as record)
  bar r.x, r.y
end sub

sub foo()
  dim r as record
  baz r
  print r.x, r.y
end sub

foo