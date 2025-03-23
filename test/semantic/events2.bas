on timer(1) gosub sayhionce
timer on
for i = 1 to 20: timer step: next i
end

sayhionce:
  print "hi"
  timer off
  return