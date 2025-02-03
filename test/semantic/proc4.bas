function foo(x as integer, y as string, z as integer) static
  i = i + 1
  print i
  foo = x * i + z
end function

print foo(2, "hello", 1)
print foo(4, "goodbye", 1)