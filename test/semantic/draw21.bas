' Bug: Update cursor after X commands.
' Should draw a line toward the top left of the screen, not in the middle.
screen 13
g$ = "bm20,20"
draw "X" + varptr$(g$) + " l20"