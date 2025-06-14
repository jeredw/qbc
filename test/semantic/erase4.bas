' Bug: Erasing record arrays should reset values
type point
  x as integer
  y as integer
  active as integer
end type

dim shared starbase(1 to 4) as point
erase starbase

print starbase(1).x, starbase(1).y, starbase(1).active
starbase(1).x = 42
starbase(1).y = 42
starbase(1).active = -1
print starbase(1).x, starbase(1).y, starbase(1).active