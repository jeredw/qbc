screen 13
line (110, 50)-(210, 150), 2, b
for i = -50 to 50
  line (160, 100 + i)-step(i, 0), 3, , &hff00
  line (160, 100 + i)-step(-i, 0), 5, , &hff00
  line (160+i, 100)-step(0, -i), 6, , &hff00
  line (160+i, 100)-step(0, i), 1, , &hff00
next i