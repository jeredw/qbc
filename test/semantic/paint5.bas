' Flood fill a circle with a tiled pattern. 
SCREEN 2
CLS
Tile$ = CHR$(&H84) + CHR$(&HCC) + CHR$(&HB4)
Tile$ = Tile$ + CHR$(&H84) + CHR$(&H84) + CHR$(&H00)
CIRCLE STEP(0, 0), 150
PAINT STEP(0, 0), Tile$