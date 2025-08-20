' Ok for local constant shadow a shared global variable defined later.
sub foo
  const k = 42
end sub
dim shared k
print "ok"