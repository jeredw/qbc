screen 13
for y = -50 to 50 step 2
  line (160, 100)-step(100, y)
  line (160, 100)-step(-100, y)
  line (160, 100)-step(2 * y, -50)
  line (160, 100)-step(2 * y, 50)
next y