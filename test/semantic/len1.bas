print len("hello world") ' 11
a$ = "sup dog"
print len(a$) ' 7
print len(a%) ' 2
print len(a!) ' 4
print len(a&) ' 4
print len(a#) ' 8
print len(x$) ' 0

dim z(10) as double
print len(z) ' 4

type inner
  a as integer     ' 2
  b as string * 10 ' 10
end type

type outer
  x as string * 20 ' 20
  y as double      ' 28
  z as inner       ' 12
end type

dim frob as outer
print len(frob)