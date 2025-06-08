' Arrays in non-static procedures are dynamic by default.
sub foo
  dim a$(10)
  redim a$(20)
  print "ok"
end sub

foo