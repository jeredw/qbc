'ASCII codes for tab, and line feed.
CONST HTAB = 9, LFEED = 10
 
CLS    ' Clear screen
INPUT "Display which file"; Filename$
OPEN Filename$ FOR INPUT AS #1
CLS
DO WHILE NOT EOF(1)
 
    ' Input a single character from the file.
    S$=INPUT$(1,#1)
    ' Convert the character to an integer and
    ' turn off the high bit so WordStar(R) files
    ' can be displayed.
    C=ASC(S$) AND &H7F
    ' Is it a printable character?
    IF (C >= 32 AND C <= 126) OR C = HTAB OR C = LFEED THEN
       PRINT CHR$(C);
    END IF
 
LOOP
END

