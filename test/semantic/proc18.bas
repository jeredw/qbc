type test
  x as string * 10
  y as integer
end type

sub foo(t() as test)
  dim tmp(10) as test
  tmp(5) = t(5)
  tmp(5).x = "hello": tmp(5).y = 42
  t(5).x = "yes": tmp(5).y = 2
end sub

dim s(10) as test
s(5).x = "hello": s(5).y = 42
foo s()
print s(5).x; s(5).y