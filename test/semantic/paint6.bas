' Flood fill a multicolor pattern.
SCREEN 1

' Define a pattern:
Tile$ = CHR$(&H6A) + CHR$(&H9A) + CHR$(&HA6) + CHR$(&HA9)

' Draw a triangle in white (color 3):
LINE (10, 25)-(310, 25)
LINE -(160, 175)
LINE -(10, 25)

' Paint the interior of the triangle with the pattern:
PAINT (160, 100), Tile$