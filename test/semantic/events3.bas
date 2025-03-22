on timer(4) gosub ok
timer on
print "yo"
sleep ' timer should wake us up
print "hi"
end
ok: print "ok": return