' Test that passing -1 as the color argument to palette works.
screen 13
line (0, 0)-(32, 32), 1, bf
palette 1, 63 * 256^2
palette 1, -1