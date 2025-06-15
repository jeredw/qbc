' bpp per plane is multiplied into bitmap width for GET/PUT.
screen 13
dim stuff(51) as integer
get (0, 0)-(9, 9), stuff
' This should print 80, 10 for a 10x10 image in screen 13 with 8bpp/plane.
print stuff(0), stuff(1)