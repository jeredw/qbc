sub foo
  on timer(5) gosub sayhi
  timer on
  exit sub
sayhi:
  print "hi"
  return
end sub

foo