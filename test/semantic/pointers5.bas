' Test varseg + sadd indexing for peek and poke.
s$ = ".."
def seg = varseg(s$)
poke sadd(s$), asc("h")
poke sadd(s$) + 1, asc("i")
print chr$(peek(sadd(s$))); chr$(peek(sadd(s$) + 1))