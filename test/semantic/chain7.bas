' Tests being chained to with a fixed length string of incompatible length.
' The associated .common file has a 5-byte string "hello".
' Should raise a type error.
common m as string * 4
print "nope"