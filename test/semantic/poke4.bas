screen 13
def fnoffs&(x, y) = y * 320 + x
def seg = &ha000
for y = 80 to 120
for x = 140 to 180
poke fnoffs&(x, y), 64 
next x
next y
print peek(fnoffs&(160, 100))