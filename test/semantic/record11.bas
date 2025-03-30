type inner
  x as string * 40
  y as integer
end type

type outer
  z as inner
  i as integer
  l as long
  s as single
  d as double
end type

dim a as outer, b as outer
a.z.x = "hello"
a.z.y = 42
a.i = 1
a.l = 245455
a.s = 3.14
a.d = 2.718281828
print a.z.x; len(a.z.x); a.z.y; a.i; a.l; a.s; a.d
print b.z.x; len(b.z.x); b.z.y; b.i; b.l; b.s; b.d
lset b = a
print a.z.x; len(a.z.x); a.z.y; a.i; a.l; a.s; a.d
print b.z.x; len(b.z.x); b.z.y; b.i; b.l; b.s; b.d
a.i = 42
a.z.y = 10
lset b.z = a.z
print a.z.x; len(a.z.x); a.z.y; a.i; a.l; a.s; a.d
print b.z.x; len(b.z.x); b.z.y; b.i; b.l; b.s; b.d