screen 13
draw "bm160,100"
for i% = 0 to 90 step 10
draw "ta" + str$(int(i%)) + "r100 bm160,100"
next i%
line (160,110)-(260, 110)
line (150, 100)-step(0, -83)