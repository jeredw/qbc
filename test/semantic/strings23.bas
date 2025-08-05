' Bug: Justifying inside empty fixed strings should use spaces.
dim s as string*10
dim t as string*10
rset s = "ok"
print s
lset t = "ok"
print t