' Test that scanning fields for INPUT statements seeks the input
' file the expected amounts.  The seek position advances up to a
' following comma or quote, over spaces, and past one newline.
OPEN "test.dat" FOR OUTPUT AS #1
PRINT #1, "   abc"
PRINT #1, "   " + CHR$(34) + "def" + CHR$(34) + " , " + CHR$(34) + "ghi" + CHR$(34) + "   "
PRINT #1, CHR$(34) + "foo" + CHR$(34) + " " + CHR$(34) + "bar" + CHR$(34)
PRINT #1, 1, 2, 3
PRINT #1, ""
PRINT #1, "4 ,5  , 6"
PRINT #1, CHR$(34) + "hello world"
PRINT #1, "yep" + CHR$(34) + "   ,   ";
PRINT #1, "okeyday"
PRINT #1, CHR$(34);
CLOSE #1
OPEN "test.dat" FOR INPUT AS #1
FOR i = 1 TO 5
INPUT #1, s$
PRINT s$, HEX$(SEEK(1) - 1)
NEXT i
FOR i = 0 TO 6
INPUT #1, a%
PRINT a%, HEX$(SEEK(1) - 1)
NEXT i
INPUT #1, s$
PRINT s$, HEX$(SEEK(1) - 1)
INPUT #1, s$
PRINT s$, HEX$(SEEK(1) - 1)