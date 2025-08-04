' Bug: Floats are valid boolean types too, and should not overflow.
foo# = 2d+20
if foo# then
  print "ok"
else
  print "nope"
end if
bar# = 0
if bar# then
  print "nope"
else
  print "ok"
end if
foo! = 6.02e23
if foo! then
  print "ok"
else
  print "nope"
end if
bar# = 0
if bar# then
  print "nope"
else
  print "ok"
end if