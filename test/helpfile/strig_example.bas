    PRINT "Press Esc to exit."
    DO
        IF STRIG(0) OR INKEY$ = CHR$(27) THEN EXIT DO
    LOOP
    DO
        BEEP                  'BEEP while trigger A is pressed.
    LOOP WHILE STRIG(1)
