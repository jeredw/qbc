' In graphics modes, screen() reads character bitmaps from the framebuffer
' and maps them back to onto characters.
screen 12
print "hello"
dim foo%(512)
get (0, 0)-(16, 16), foo%
print screen(1, 1)
put (0, 32), foo%, pset
locate 4, 1: print screen(3, 1)