type test
  x as string * 10
  y as integer
end type

sub foo(t as test)
  dim tmp as test
  tmp = t
  tmp.x = "hello": tmp.y = 42
end sub

dim s as test
foo s
print s.x; s.y