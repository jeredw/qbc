' Flood filling a multicolor pattern with a border color.
SCREEN 1

' Define a pattern:
Tile$ = CHR$(&H6A) + CHR$(&H9A) + CHR$(&HA6) + CHR$(&HA9)

' Draw a triangle in magenta (color 2):
LINE (10, 25)-(310, 25), 2
LINE -(160, 175), 2
LINE -(10, 25), 2

' Paint the interior of the triangle with the pattern,
' adding the border argument (, 2) to tell PAINT
' where to stop:
PAINT (160, 100), Tile$, 2