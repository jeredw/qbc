DECLARE SUB PlaceGorillas (BCoor() AS ANY)
TYPE XYPoint
  XCoor AS INTEGER
  YCoor AS INTEGER
END TYPE
DIM BCoor(0 TO 30) AS XYPoint

CALL PlaceGorillas(BCoor())

SUB PlaceGorillas (BCoor() AS XYPoint)
  PRINT "ok"
END SUB