CLS                       ' Clear screen
DIM KeyText$(3)
DATA Add, Delete, Quit
' Assign soft-key strings to F1 to F3.
FOR I = 1 TO 3
   READ KeyText$(I)
   KEY I, KeyText$(I) + CHR$(13)
NEXT I
' Print menu.
PRINT "                 Main Menu" : PRINT
PRINT "           Add to list (F1)"
PRINT "           Delete from list (F2)"
PRINT "           Quit (F3)" : PRINT
' Get input and respond.
DO
   LOCATE 7,1 : PRINT SPACE$(50);
   LOCATE 7,1 : INPUT "             Enter your choice:", R$
   SELECT CASE R$
      CASE "Add", "Delete"
         LOCATE 10,1 : PRINT SPACE$(15);
         LOCATE 10,1 : PRINT R$;
      CASE "Quit"
         EXIT DO
      CASE ELSE
         LOCATE 10,1 : PRINT "Enter first word or press key."
   END SELECT
LOOP
