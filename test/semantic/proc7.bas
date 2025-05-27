TYPE StockItem
   PartNumber  AS STRING * 6
   Description AS STRING * 20
   UnitPrice   AS SINGLE
   Quantity    AS INTEGER
END TYPE

DECLARE SUB AddRecord (RecordVar AS StockItem)

DIM StockRecord AS StockItem

AddRecord StockRecord

SUB AddRecord (RecordVar AS StockItem) STATIC
  PRINT "ok"
END SUB