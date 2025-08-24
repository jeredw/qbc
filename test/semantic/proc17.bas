' Test that records passed by reference are copied by value into local record
' variables.
type test
  x as string * 10
  y as integer
end type

sub foo(t as test)
  dim tmp as test
  tmp = t
  ' Should not update s!
  tmp.x = "hello": tmp.y = 42
end sub

dim s as test
foo s
print s.x; s.y