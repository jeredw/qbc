CLS    ' Clear screen
INPUT "Binary number = ", Binary$   'Input binary number as
                                    'string.
Length = LEN(Binary$)               'Get length of string.
Decimal = 0
FOR K = 1 TO Length
   'Get individual digits from string, from left to right.
   Digit$ = MID$(Binary$, K, 1)
   'Test for valid binary digit.
   IF Digit$ = "0" OR Digit$ = "1" THEN
      'Convert digit characters to numbers.
      Decimal = 2 * Decimal + VAL(Digit$)
   ELSE
      PRINT "Error--invalid binary digit: "; Digit$
      EXIT FOR
   END IF
NEXT
PRINT "Decimal number =" Decimal
