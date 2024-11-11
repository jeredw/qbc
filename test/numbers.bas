'intmin% = -32768
intmax% = 32767
hexmin% = &h0
hexmax% = &hffff
octmin% = &o0
octmax% = &o177777
'longmin = -2147483648
longmax& = 2147483647
longhexmin& = &h0&
longhexmin& = &hffffffff&
longoctmin& = &o0&
longoctmax& = &o37777777777&
'Floats
'floatmin = -3.37E+38
floatmax! = 3.37E+38
'Exponential form denoted by E
floatwithe! = 1.5e2
'A trailing exclamation mark (!)
floatwithsigil! = 1.5!
'A value containing a decimal point that does not have a D in the
'exponent or a trailing number sign (#) and that has fewer than
'15 digits
floatsmall! = 1.234567
'A value without a decimal point that has fewer than 15 digits
'but cannot be represented as a long-integer value
floatbigint! = 2147483648
'Doubles
'doublemin = -1.67D+308
doublemax# = 1.67D+308
'Exponential form denoted by D
doublewithd# = 1.5d2
'A trailing number sign (#)
doublewithsigil# = 1.5#
'decimal point, no E in the exponent or trailing exclamation
'mark (!), and more than 15 digits
doubletoobig# = 1.2345678
