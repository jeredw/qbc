    'This example runs only in a network environment.
    OPEN "TEST.DAT" FOR RANDOM AS #1
    FOR i% = 1 TO 10
        PUT #1, , i%
    NEXT i%
    LOCK #1, 2         'Lock record 2.
    GET #1, 2, i%
    UNLOCK #1, 2       'Unlock record 2.
