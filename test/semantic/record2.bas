type test
  a as integer
  b as string * 42
end type

dim x as test, y as test
x.b = "hello"
print x.b  ' hello
print y.b  ' <empty>
y = x
print x.b   ' hello
print y.b   ' hello
y.b = "ok"
print x.b   ' hello
print y.b   ' ok
x.b = "yes"
print x.b   ' yes
print y.b   ' ok