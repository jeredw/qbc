' Test reading past the end of a bitmap in PUT.
dim p%(2)
p%(0) = 24  ' 3px width
p%(1) = 1   ' 1px height
p%(2) = &h505  ' two magenta pixels
screen 13
pset (3, 1), 5 ' fill pixels beyond bitmap
pset (4, 1), 2
put (1, 1), p%, pset
' Put should have replaced this magenta pixel with 0.
locate 2, 1: print point(3, 1)