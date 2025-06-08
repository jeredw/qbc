' PEEK/POKE past the bounds of a variable just does nothing
a% = 42
def seg = varseg(a%)
poke 100, 100
print peek(100)
def seg
print "ok"