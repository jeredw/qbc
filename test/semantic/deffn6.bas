' def fn procedures pass parameters by value.
def fnf(x as integer, y as string)
  x = 0
  y = "nope"
end def

a = 42: b$ = "ok"
' Note: passing a by reference would fail because it is a single.
print fnf(a, b$)
print a, b$