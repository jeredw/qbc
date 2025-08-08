' Test record assignment from incompatible types.
type inner
  x as integer
end type

type outer
  thing as inner
end type

dim a as outer, b as outer
b.thing.x = 42
' This is the wrong type, should error with type mismatch.
a.thing = b
print a.thing.x