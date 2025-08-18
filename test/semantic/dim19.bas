' It is ok to define a local variable with the same name but a different type
' as a shared global with no AS type (like any other variables.)
dim shared x%
sub foo
  dim x$
end sub
print "ok"