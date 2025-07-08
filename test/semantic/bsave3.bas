' Test bsaving nested record types.
type inner
  x as integer
  y as integer
end type
type outer
  a as inner
  b as inner
end type
dim foo(1) as outer
foo(0).a.x = 1
foo(0).a.y = 2
foo(0).b.x = 3
foo(0).b.y = 4
foo(1).a.x = 5
foo(1).a.y = 6
foo(1).b.x = 7
foo(1).b.y = 8
def seg = varseg(foo(0))
bsave "foo.dat", varptr(foo(0)), 16
def seg