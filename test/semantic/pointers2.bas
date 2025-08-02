' Test that VARPTR gets an offset from an array index.
' $DYNAMIC
dim a%(20)
print varptr(a%(10))