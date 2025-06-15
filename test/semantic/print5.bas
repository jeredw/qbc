' Test PRINT USING format specifiers.
print "123456789012345678901234567890"
print using "#^^^^"; 0
print using "#.^^^^"; 0
print using "+#.^^^^"; 0
print using "+**#.^^^^"; 0
print using "+**$#.^^^^"; 0
print using "+**$,#.^^^^"; 0
print using "+**$#,#.^^^^"; 0
print using "#^^^^"; 2
print using "##^^^^"; 2
print using "###^^^^"; 2
print using "####^^^^"; 2
print using "$$##.##^^^^"; 2
print using "**$##.##^^^^"; 2
print using "**$##,.##^^^^"; 2000000
print using "**$##,.##^^^^+"; 2000000
print using "**$##,.##^^^^-"; -2000000
print using "#^^^^"; -2
print using "##^^^^"; -2
print using "#.#^^^^"; -2
print using "#.#^^^^"; 2
print using "##.#^^^^"; 3.55  ' 3.5E+00
print using "##.#^^^^"; 3.65  ' 3.7E+00
print using "##.#^^^^"; 4.55  ' 4.6E+00
print using "##.#^^^^"; 4.65  ' 4.7E+00

print using "#"; -.4 ' -
print using "#"; .4  ' 0
print using "#"; -.5 ' %-1
print using "#"; .5  ' 1

print using "#"; 200.5 ' %201
print using "#.#"; 200.5 ' %200.5
print using ".#"; -.2 ' %-.2
print using ".#"; .09 ' .1
print using ".#"; .009 ' .0

print using "# #"; 1; 2; 3; 4; 5
print using "[.#.#]"; .1; .2; .3; .4; .5

' TODO: fixed sometimes switches to exponential for overflow
' print using "#.#"; 2000000.5# ' %0.2D+07