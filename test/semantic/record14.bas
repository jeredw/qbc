' Bug: Assigning from a nested record should work.
type inner
  x as integer
end type

type outer
  thing as inner
end type

dim a as outer, b as outer
b.thing.x = 42
a.thing = b.thing
print a.thing.x