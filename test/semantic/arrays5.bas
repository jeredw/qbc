dim t(11)
t = 2 : t(0) = 1          'T is simple variable.
for i% = 0 to 10          'T(0) is element of array.
  t(i% + 1) = t * t(i%)
next
print t
print t(11)
