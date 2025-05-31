sub foo(p() as integer)
  print p(0)
  dim d(1) as integer
  if p(0) > 0 then
    d(0) = p(0) - 1
    foo d()
  end if
  print p(0)
end sub

dim s(1) as integer
s(0) = 4
foo s()