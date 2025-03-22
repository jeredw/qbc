on timer(1) gosub sayhionce
timer on
i = 0
i = 0
i = 0
i = 0
i = 0
i = 0
i = 0 ' timer has ticked a lot now, should be no more "hi"s
end

sayhionce:
  print "hi"
  timer off
  return