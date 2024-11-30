    DEF SEG = 0
    Status% = PEEK(&H417)              'Read keyboard status.
    POKE &H417, (Status% XOR &H40)     'Change Caps Lock state, bit 6.
