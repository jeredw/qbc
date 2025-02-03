'*** Programming example that uses WIDTH ***
OPEN "LPT1:" FOR OUTPUT AS #1
Test$ = "1234567890"
WIDTH #1, 3
PRINT #1, Test$
WIDTH #1, 4
PRINT #1, Test$
CLOSE
