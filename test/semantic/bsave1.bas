DIM Cube(1 TO 675)

SCREEN 1
' Draw a white box.
LINE (140,25)-(140+100,125),3,b
' Draw the outline of a magenta cube inside the box.
DRAW "C2 BM140,50 M+50,-25 M+50,25 M-50,25"
DRAW "M-50,-25 M+0,50 M+50,25 M+50,-25 M+0,-50 BM190,75 M+0,50"
' Save the drawing in the array Cube.
GET (140,25)-(240,125),Cube
' Store the drawing in a disk file. Note: 2700 is the number
' of bytes in Cube (4 bytes per array element * 675).
DEF SEG=VARSEG(Cube(1)) ' Set segment to array's segment.
BSAVE "magcube.grh",VARPTR(Cube(1)),2700
DEF SEG   ' Restore BASIC segment.