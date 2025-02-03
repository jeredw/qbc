function ugh(x as integer)
  print x
  ugh = x
end function

select case ugh(1)
case ugh(2) to ugh(3):
  print "nope"
case is >= ugh(4), is <= ugh(5):
  print "ok"
case ugh(6):
  print "nope"
case else:
  print "nope"
end select