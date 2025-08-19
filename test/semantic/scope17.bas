' Local can't shadow shared global.
dim shared x
sub foo
  dim x
end sub