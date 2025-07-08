' Test bloading nested record types.
type inner
  x as integer
  y as integer
end type
type outer
  a as inner
  b as inner
end type
dim foo(1) as outer
def seg = varseg(foo(0))
bload "foo.dat", varptr(foo(0))
def seg
print foo(0).a.x; foo(0).a.y; foo(0).b.x; foo(0).b.y; 
print foo(1).a.x; foo(1).a.y; foo(1).b.x; foo(1).b.y; 