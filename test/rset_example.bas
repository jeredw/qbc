DIM TmpStr2 AS STRING * 10
CLS    ' Clear screen
PRINT "         1         2         3"
PRINT "123456789012345678901234567890"
' Use RSET on null variable-length string of length.
' Nothing prints because TmpStr$ is a zero-length field.
TmpStr$ = ""
RSET TmpStr$ = "Another"
PRINT TmpStr$
' Use RSET on variable-length string with a value.
TmpStr$ = SPACE$(20)
RSET TmpStr$ = "Another"
PRINT TmpStr$
' Use RSET on fixed-length string of length 10.
RSET TmpStr2 = "Another"
PRINT TmpStr2
