' Exponentiation promotes to single precision.
' While most operators take on the precision of their most precise arguments,
' exponentiation promotes to single precision if necessary.
a% = 300
b% = 15
' This doesn't overflow.
print a% ^ b%