    'Play scale in 7 different octaves
    scale$ = "CDEFGAB"
    PLAY "L16"
    FOR i% = 0 TO 6
        PLAY "O" + STR$(i%)
        PLAY "X" + VARPTR$(scale$)
    NEXT i%
