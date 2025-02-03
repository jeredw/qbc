type foo
  x as string * 20
end type

sub quack(t as foo, n as integer)
  t.x = "quack" + t.x
  if n > 0 then
    quack t, n-1
  end if
end sub

dim a as foo
quack a, 4
print a.x