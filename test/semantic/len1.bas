print len("hello world")
a$ = "sup dog"
print len(a$)
print len(a%)
print len(a!)
print len(a&)
print len(a#)

dim x(10) as double
print len(x)

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