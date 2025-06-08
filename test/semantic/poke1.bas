' POKE into legit byte range inside a variable updates the variable
a% = 42
def seg = varseg(a%)
print a%, peek(varptr(a%)), peek(varptr(a%) + 1)
poke varptr(a%), 2
print a%, peek(varptr(a%)), peek(varptr(a%) + 1)
def seg