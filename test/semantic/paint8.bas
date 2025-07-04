' Flood filling patterns in multi-plane graphics modes.
SCREEN 8
DIM Row$(1 TO 4)

' Two rows of alternating magenta and yellow:
Row$(1) = CHR$(&HC3) + CHR$(&H3C) + CHR$(&HFF) + CHR$(&H3C)
Row$(2) = Row$(1)

' Invert the pattern (two rows of alternating yellow
' and magenta):
Row$(3) = CHR$(&H3C) + CHR$(&HC3) + CHR$(&HFF) + CHR$(&HC3)
Row$(4) = Row$(3)

' Create a pattern tile from the rows defined above:
FOR I% = 1 TO 4
    Tile$ = Tile$ + Row$(I%)
NEXT I%

' Draw box and fill it with the pattern:
LINE (50, 50)-(570, 150), , B
PAINT (320, 100), Tile$