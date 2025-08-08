' Test BLOADing with an offset.
defint a-z
dim x(11)
dim y(5)
for i = 0 to 5
  x(i) = 10 * i
  y(i) = i
next i
def seg = varseg(y(0))
bsave "slice", varptr(y(0)), 6 * 2
def seg = varseg(x(6))
bload "slice", varptr(x(6))
for i = 0 to 5
  print x(i); x(i + 6)
next i