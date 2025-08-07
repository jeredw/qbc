screen 0
def seg = &hb800
poke 0, asc("h")
poke 1, &h18
poke 2, asc("e")
poke 3, &h18
poke 4, asc("l")
poke 5, &h18
poke 6, asc("l")
poke 7, &h18
poke 8, asc("o")
poke 9, &h18
locate 2, 1
attr% = peek(1)
bg% = attr% \ 16
fg% = attr% and 15
color fg%, bg%
print chr$(peek(0));
print chr$(peek(2));
print chr$(peek(4));
print chr$(peek(6));
print chr$(peek(8))