' Test computed goto (multiway branch).
on 2 + 2 goto 10, 20, 30, 40
10 print "nope": end
20 print "nope": end
30 print "nope": end
40 print "ok"

on 0 goto 10, 20, 30
print "ok"
on 4 goto 10, 20, 30
print "ok"
on 1 gosub 50, 10, 20
50 print "ok"