sub foo
  gosub 20
  exit sub
20 return
end sub
call foo
print "ok"