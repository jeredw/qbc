sub foo
  on timer(5) gosub sayhi
  timer on
end sub

foo
for i = 1 to 5: timer step: next i
end

sayhi:
  print "hi"
  return