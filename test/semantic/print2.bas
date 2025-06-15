' Can't PRINT records.
type foo
  x as integer
end type
dim test as foo
' Should fail with "Type mismatch".
print test