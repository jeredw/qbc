' Bug: Use BIOS 8x8 font instead of VGA 9x8 font.
cls
screen 1
print "Z Z Z"
print "_ _ _"
print chr$(223) + " " + chr$(219) + " " + chr$(223)