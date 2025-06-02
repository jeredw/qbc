on timer(1) gosub sayhi
timer on
on timer(1) gosub 0
timer step
timer step
print "ok"
end

sayhi:
  print "nope"
  return