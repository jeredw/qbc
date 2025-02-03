  CONST NO = 0, YES = NOT NO
  DEF FNIsThereAZ (A$)
  STATIC I
    FOR I = 1 TO LEN(A$)
     IF UCASE$(MID$(A$, I, 1)) = "Z" THEN
       FNIsThereAZ = YES
       EXIT DEF
      END IF
    NEXT I
    FNIsThereAZ = NO
  END DEF
