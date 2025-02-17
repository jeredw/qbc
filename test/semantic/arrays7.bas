type bar
  n as integer
end type
type foo
  x as string * 20
  y as bar
end type
dim z(20) as foo
z(2).x = "hello"
z(2).y.n = 42
print z(2).x
print z(2).y.n