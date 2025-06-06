DIM Cube(1 TO 675)

' Set the screen mode--the mode should be the same as the
' mode used to create the original drawing.
SCREEN 1

' Load the drawing into the array Cube.
DEF SEG=VARSEG(Cube(1)) ' Get the array's segment.
BLOAD "magcube.grh",VARPTR(Cube(1))
DEF SEG   ' Restore the default segment.
' Put the drawing on the screen.
PUT (80,10),Cube