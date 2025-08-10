' Test that varseg works with element references.
type stuff
  s as string * 1000
  t as string * 100
end type

dim thing as stuff
thing.s = "s"
thing.t = "t"
def seg = varseg(thing.s)
print varseg(thing.s); varptr(thing.s); chr$(peek(varptr(thing.s)))
def seg = varseg(thing.t)
print varseg(thing.t); varptr(thing.t); chr$(peek(varptr(thing.t)))