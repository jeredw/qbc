type inner
  x as string * 42
end type

type outer
  a as inner
end type

dim s as outer, t as outer
t.a.x = "yo howdy"
s = t
print s.a.x
print t.a.x