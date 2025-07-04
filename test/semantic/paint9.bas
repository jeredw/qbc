' Skipping background pattern rows while flood filling.
' TODO: Support stopping paint when 2 or more pattern rows match.
SCREEN 1

' Define a pattern (two rows each of cyan, magenta, white):
Tile$ = CHR$(&H55) + CHR$(&H55) + CHR$(&HAA)
Tile$ = Tile$ + CHR$(&HAA) + CHR$(&HFF) + CHR$(&HFF)

' Draw a triangle in white (color number 3):
LINE (10, 25)-(310, 25)
LINE -(160, 175)
LINE -(10, 25)

' Paint the interior magenta:
PAINT (160, 100), 2, 3

' Wait for a keystroke:
'Pause$ = INPUT$(1)

' Since the background is already magenta, CHR$(&HAA) tells
' PAINT to skip over the magenta rows in the pattern tile:
PAINT (160, 100), Tile$, , CHR$(&HAA)