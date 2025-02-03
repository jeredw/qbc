for i = 1 to 10 step .1: for j = 5 to -1 step -3
  sum = sum + i + j
  loops = loops + 1
next j, i
' TODO: qbasic says 2011.5, 270
print sum
print loops