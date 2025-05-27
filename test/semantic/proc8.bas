TYPE StockItem
   PartNumber  AS STRING * 6
   Description AS STRING * 20
   UnitPrice   AS SINGLE
   Quantity    AS INTEGER
END TYPE

TYPE Bogus
  Thing AS INTEGER
END TYPE

DECLARE SUB AddRecord (RecordVar AS StockItem)

DIM StockRecord AS StockItem, Bogus AS Bogus

AddRecord Bogus

SUB AddRecord (RecordVar AS StockItem) STATIC
  PRINT "ok"
END SUB