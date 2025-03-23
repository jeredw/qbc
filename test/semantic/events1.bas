on timer(5) gosub sayhi
timer on
for i = 1 to 5: timer step: next i
for i = 1 to 5: timer step: next i
end

sayhi:
  print "hi"
  return