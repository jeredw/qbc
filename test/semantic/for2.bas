' Test that for loop body is skipped based on bounds and step.
pass = 0
for i = 1 to 10 step 1
  pass = 1
next i
if pass then print "1->10 +1 ok" else print "1->10 +1 fail"

pass = 0
for i = 1 to 10 step 0
  pass = 1
  exit for
next i
if pass then print "1->10  0 ok" else print "1->10  0 fail"

pass = 1
for i = 1 to 10 step -1
  pass = 0
next i
if pass then print "1->10 -1 ok" else print "1->10 -1 fail"

pass = 1
for i = 10 to 1 step 1
  pass = 0
next i
if pass then print "10->1 +1 ok" else print "10->1 +1 fail"

pass = 1
for i = 10 to 1 step 0
  pass = 0
  exit for
next i
if pass then print "10->1  0 ok" else print "10->1  0 fail"

pass = 0
for i = 10 to 1 step -1
  pass = 1
next i
if pass then print "10->1 -1 ok" else print "10->1 -1 fail"

pass = 0
for i = 1 to 1 step 1
  pass = 1
next i
if pass then print "1->1  +1 ok" else print "1->1  +1 fail"

pass = 0
for i = 1 to 1 step 0
  pass = 1
  exit for
next i
if pass then print "1->1   0 ok" else print "1->1   0 fail"

pass = 0
for i = 1 to 1 step -1
  pass = 1
next i
if pass then print "1->1  -1 ok" else print "1->1  -1 fail"