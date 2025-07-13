' Bug: draw parsing must preserve X pointer bytes
screen 13
for i = 0 to 20
draw "ta=" + varptr$(i)
draw "u5"
next i