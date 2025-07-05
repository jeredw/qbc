' shared statement exposes globals in procedures.
dim x as string
sub test
  shared x as string
  x = "ok"
end sub
test
print x