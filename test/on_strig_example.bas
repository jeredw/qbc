    'This example requires a joystick.
    ON STRIG(0) GOSUB Handler
    STRIG(0) ON
    PRINT "Press Esc to exit."
    DO UNTIL INKEY$ = CHR$(27): LOOP
    END

Handler:
    PRINT "Joystick trigger is depressed."
    RETURN
