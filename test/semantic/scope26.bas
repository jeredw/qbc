' Local can't shadow a procedure defined later.
sub foo
  dim bar(2)
end sub
sub bar: end sub