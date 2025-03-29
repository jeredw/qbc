print "hello"
on pen gosub wow
pen on
pen step
end

wow:
for i = 0 to 9
  print i, pen(i)
next i
return