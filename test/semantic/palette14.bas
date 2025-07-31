' Test reading back VGA palette data.
screen 13
r& = 15: g& = 24: b& = 7
palette 0, 256 * (r& * 256 + g&) + b&
r& = 5: g& = 4: b& = 2
palette 1, 256 * (r& * 256 + g&) + b&
out &h3c7, 0
print inp(&h3c9);
print inp(&h3c9);
print inp(&h3c9)
print inp(&h3c9);
print inp(&h3c9);
print inp(&h3c9)