screen 0
for bg = 0 to 15
  for fg = 0 to 31
    color fg, bg
    print "#";
  next fg
  print
next bg