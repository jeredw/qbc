' Test chaining with a static array.
' $STATIC
dim a(1, 1, 1)
common a()
a(1, 1, 1) = 42
chain "chain15.bas"