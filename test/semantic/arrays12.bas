sub foo(n as integer)
  dim x(4) as integer
  print x(0)
  x(0) = 42
  if n = 0 then
    foo(1)
  end if
  print x(0)
end sub

foo 0