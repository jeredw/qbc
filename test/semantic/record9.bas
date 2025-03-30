type apple
  x as integer
  y as integer
end type

type orange
  x as integer
end type

dim a as apple, o as orange
a.x = 0
a.y = 1
o.x = 42
print a.x, a.y, o.x
lset a = o
print a.x, a.y, o.x