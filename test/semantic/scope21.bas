' Local can't shadow a shared global.
dim shared a(2)
sub foo
  dim a(2)
end sub