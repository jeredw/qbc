' Test chaining with common dynamic array data.
' $DYNAMIC
common a()
dim a(3, 3)
a(0, 0) = 42
a(1, 1) = 42
a(2, 2) = 42
a(3, 3) = 42
chain "chain11.bas"