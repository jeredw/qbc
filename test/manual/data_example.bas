' Get the date.
C$ = DATE$
' Use VAL to split the month off the string returned by
' DATE$.
FOR I% = 1 TO VAL(C$)
    READ Month$
NEXT
DATA January, February, March, April, May, June, July
DATA August, September, October, November, December
 
' Get the day.
Day$ = MID$(C$,4,2)
IF LEFT$(Day$,1) = "0" THEN Day$ = RIGHT$(Day$,1)
' Get the year.
Year$ = RIGHT$(C$,4)
 
PRINT "Today is " Month$ " " Day$ ", " Year$
