CONST PI = 3.1415926536
CLS    ' Clear screen
SCREEN 1
 
CIRCLE (190, 100), 100, 1, , , .3   'Outline fish body in cyan.
CIRCLE (265, 92), 5, 1, , , .7      'Outline fish eye in cyan.
PAINT (190, 100), 2, 1              'Fill in fish body with magenta.
 
LINE (40, 120)-STEP (0, -40), 2     'Outline
LINE -STEP (60, 20), 2              '   tail in
LINE -STEP (-60, 20), 2             '      magenta.
PAINT (50, 100), 1, 2               'Paint tail cyan.
 
CIRCLE (250,100),30,0,PI*3/4,PI* 5/4,1.5  'Draw gills in black.
FOR Y = 90 TO 110 STEP 4
   LINE (40, Y)-(52, Y), 0          'Draw comb in tail.
NEXT
