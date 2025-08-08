' Tests chaining to a program with common record data.
type potato
starchiness as double
end type

type pantry
x as integer
h as string * 5
p as potato
end type

common q as pantry

q.x = 42
q.h = "hello"
q.p.starchiness = 10

chain "chain9.bas"