sub foo(x() as integer, n as single)
  x(2) = 42
end sub
dim x(10) as integer
foo x(), x
print x(2)