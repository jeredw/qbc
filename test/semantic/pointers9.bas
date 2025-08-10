' Test that varseg works with array element references.
type stuff
  s as string * 2
  t as string * 10
end type

dim thing(10) as stuff
thing(10).s = "s"
thing(10).t = "t"
def seg = varseg(thing(10).s)
print varseg(thing(10).s); varptr(thing(10).s); chr$(peek(varptr(thing(10).s)))
def seg = varseg(thing(10).t)
print varseg(thing(10).t); varptr(thing(10).t); chr$(peek(varptr(thing(10).t)))