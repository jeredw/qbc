    a$ = "Where is Paris?"
    PRINT MID$(a$, 10, 5)       'Output is:  Paris
    Text$ = "Paris, France"
    PRINT Text$                 'Output is:  Paris, France
    MID$(Text$, 8) = "Texas "
    PRINT Text$                 'Output is:  Paris, Texas
