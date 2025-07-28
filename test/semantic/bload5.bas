' Test BLOADing to the screen segment to blit a bitmap.
screen 13
' Generates a test image with vertical bars.
'open "test.pic" for output as #1
'print #1, chr$(&hfd);
'print #1, chr$(0);
'print #1, chr$(&ha0);
'print #1, chr$(0);
'print #1, chr$(0);
'print #1, chr$(0);
'print #1, chr$(&hfa);
'for y = 0 to 199
'for x = 0 to 319
'print #1, chr$(x and 255);
'next x
'next y
'close #1
def seg = &ha000
bload "test.pic", 0