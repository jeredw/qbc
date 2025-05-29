type test
  x as string * 10
  y as integer
end type

sub foo(t as test)
  t.x = "hello": t.y = 42
end sub

dim s as test
foo s
print s.x; s.y