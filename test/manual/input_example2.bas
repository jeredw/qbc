' NOTE: Before you run this program, create a one-line data file
'       CLASS.DAT made up of a series of test scores -- 97 84 63 89 100.
 
DEFINT A-Z
CLS    ' Clear screen
OPEN "class.dat" FOR INPUT AS #1
 
DO WHILE NOT EOF(1)
   Count = Count + 1
   INPUT #1, Score
   Total = Total + Score
   PRINT Count; Score
LOOP
PRINT
PRINT "Total students:";Count;" Average score:";Total / Count
