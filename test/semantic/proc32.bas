' Bug: Type check array arguments
SUB PrintOut(A(2)) STATIC
  FOR Row = LBOUND(A,1) TO UBOUND(A,1)
  FOR Col = LBOUND(A,2) TO UBOUND(A,2)
    PRINT A(Row,Col)
  NEXT Col
  NEXT Row
END SUB

dim a(1 to 2, 1 to 2)
' Should fail with "Parameter type mismatch".
PrintOut a