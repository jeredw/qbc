a = 42
b = 1
print a, b
swap a, b
print a, b
a$ = "hi"
b$ = "yo"
print a$, b$
swap a$, b$
print a$, b$
a(1) = 2
b(1) = 1
print a(1), b(1)
swap a(1), b(1)
print a(1), b(1)
type foo
 x as integer
end type
dim var1(5) as foo, var2(5) as foo
var1(1).x = 5
var2(1).x = 7
print var1(1).x, var2(1).x
swap var1(1).x, var2(1).x
print var1(1).x, var2(1).x