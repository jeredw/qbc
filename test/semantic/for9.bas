' Test goto next for integer counters.
defint a-z

' Negative counter inf loops.
i = -42
goto insidei
for i = 1 to 5
  print "nope": goto test2
insidei:
next i
print "ok"

' Zero counter inf loops.
test2:
j = 0
goto insidej
for j = 1 to 5
  print "nope": goto test3
insidej:
next j
print "ok"

' Uninitialized counter inf loops.
test3:
goto insideq
for q = 1 to 5
  print "nope": goto test4
insideq:
next q
print "ok"

' Positive counter falls through.
test4:
k = 42
goto insidek
for k = 1 to 5
  print "nope": end
insidek:
next k
print "ok"