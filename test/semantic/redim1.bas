' Test that redim reallocates and clears a dynamic array.
max% = 5
dim x(max%)

for i = 0 to max%
  x(i) = i
  print x(i);
next i
print ubound(x)

max% = max% + 1
redim x(max%)

for i = 0 to max%
  print x(i);
next i
print ubound(x)