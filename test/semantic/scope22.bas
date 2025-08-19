' Local can't shadow a shared global defined later.
sub foo
  dim a(2)
end sub
dim shared a(2)