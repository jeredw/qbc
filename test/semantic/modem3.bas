open "com1:9600,N,8,1" as #1
on com(1) gosub gotdata
com(1) on
print #1, "ATDT/test"
for i = 1 to 10000: next i
close #1
end

gotdata:
  print input$(loc(1), #1);
  return
