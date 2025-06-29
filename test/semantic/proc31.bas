' Bug: functions impliclty return default values if nothing else
function foo
  shared k
  if k = 0 then foo = 42
  k = k + 1
  print k
end function
for i = 1 to 2
  ' foo should return 42 the first time and 0 afterwards.
  ' If we do not install a default return value, we will reuse
  ' the prior value of z, and it will always return 42.
  z = foo
  print z
next i