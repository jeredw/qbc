    'Calls routine for printing the screen to a local printer.
    DIM a%(2)
    DEF SEG = VARSEG(a%(0))
    FOR i% = 0 TO 2
       READ d%
       POKE VARPTR(a%(0)) + i%, d%
    NEXT i%
    DATA 205, 5, 203  : ' int 5  retf  'Machine-language code
                                       'for printing screen.
    CALL ABSOLUTE(VARPTR(a%(0)))
    DEF SEG
