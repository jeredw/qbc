' Bug: For loop counter can shadow a different as type
dim i as string
sub foo
  for i = 1 to 10
    print i
  next i
end sub
foo