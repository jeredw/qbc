if TRUE then 10 else 20
if 0 then if 1 then print "hi": goto 5 else 30
if foo then
  if bar then
    print "hi"
  end if
elseif baz then
  print "yo"
else
  print 42
end if
if foo then
elseif bar then print "yes"
print "more"
end if
10 if foo then
20
30 elseif bar then : print "ok"
40 print "yes ok"
50 else print "baz": print "quux"
60 end if: print "ok"
if foo then yow
' Inline if accepts an empty statement
if 1 then : print "hi"
' Inline if with implicit goto allows colon after target
if 1 then 20 : else if 2 then gosub 30
if err = 9 then resume next else print "unexpected"
' Inline if with else allows colon after else.
if 1 then : x = 0 : else : y = 0 : z = 0
' IDE fixes "endif" to be "end if".
if foo then
endif