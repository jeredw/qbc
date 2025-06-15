' PRINT USING number fields can have multiple commmas.
SUB PrintScore (score1, lives1)
  PRINT USING "SAMMY-->  Lives: #     #,###,#00"; lives1; score1
END SUB 

PrintScore 0, 5
PrintScore 9, 5
PrintScore 99, 5
PrintScore 999, 5
PrintScore 9999, 5