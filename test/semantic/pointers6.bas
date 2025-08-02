' Test varseg + varptr indexing for peek and poke.
dim s%(1)
def seg = varseg(s%(0))
poke varptr(s%(0)), 42
poke varptr(s%(1)), 10
print peek(varptr(s%(0))); peek(varptr(s%(1)))