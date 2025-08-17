' Labels that could be implicit calls are treated as labels.
sub foo
  print "this should not be printed"
end sub

foo : print "testing"