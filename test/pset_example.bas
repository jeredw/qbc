    'This example requires a color graphics adapter.
    SCREEN 1
    FOR i% = 0 TO 320
        PSET (i%, 100)
        FOR delay% = 1 TO 100: NEXT delay%
        PRESET (i%, 100)
    NEXT i%
