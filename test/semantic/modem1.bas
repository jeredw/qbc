open "com1:9600,N,8,1" as #1
print #1, "ATDT/test"
' 10000 iterations should be enough for anybody.
for i = 1 to 10000
  if not eof(1) then
    print input$(loc(1), #1);
  end if
next i
close #1