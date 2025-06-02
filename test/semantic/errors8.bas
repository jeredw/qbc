on timer(1) gosub tick
timer on
on error goto handler
print 1/0
end

tick: print "tick": return
handler:
  timer step
  timer step
  timer step
  resume next