screen 8
dim bitmap%(217)
for i = 0 to 15
  line (5+i, 5+i)-(20, 20), -1 + i, bf
next i
get (0, 0)-(26, 26), bitmap%
put (30, 0), bitmap%
put (60, 0), bitmap%, preset
line (90, 0)-(100, 20), 3, bf
line (100, 0)-(105, 20), 7, bf
put (90, 0), bitmap%, and
line (120, 0)-(130, 20), 1, bf
put (120, 0), bitmap%, or
line (150, 0)-(160, 20), 8, bf
put (150, 0), bitmap%, xor