cls
screen 13
pset step(0, 0), 15
pset step(-10, -10), 1
pset step(-10, -10), 2
pset step(-10, -10), 3

pset (-1, 0), 11
pset (0, 0), 15
pset (319, 0), 15
pset (0, 199), 15
pset (319, 199), 15

pset (320, 0), 11
pset (320, 200), 11
pset (-1, 0), 11
pset (-1, 200), 11
pset (0, -1), 11
pset (0, 201), 11

for i% = 0 to 40
  pset (i% + 20, 100 - i%), 15
next i%