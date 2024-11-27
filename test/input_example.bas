CLS
PI = 3.141593 : R = -1
DO WHILE R
    PRINT "Enter radius (or 0 to quit)."
    INPUT ; "If radius = ", R
    IF R > 0 THEN
        A = PI * R ^ 2
        PRINT ", the area of the circle ="; A
    END IF
    PRINT
LOOP
