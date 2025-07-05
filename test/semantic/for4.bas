' Test side effects of for loop control using function calls.
function ugh(x as integer)
  print x
  ugh = x
end function

for i = ugh(1) to ugh(-1) step ugh(2)
for j = ugh(3) to ugh(4)
next j: next i