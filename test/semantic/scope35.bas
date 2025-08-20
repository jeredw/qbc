' Ok for local constant shadow a shared global variable.
dim shared k
sub foo
  const k = 42
end sub
print "ok"