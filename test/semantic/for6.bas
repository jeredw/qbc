' Bug: It is weird, but legal to jump over for loop initialization.
j = 0
goto n
for i = 0 to 10
print i;
j = j + 1
if j > 10 then exit for
n:
next i