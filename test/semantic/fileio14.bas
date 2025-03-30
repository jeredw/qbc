open "test.txt" for random as #1
field #1, 20 as x$(1), 10 as x$(2)
field #1, 15 as x$(3)
lset x$(3) = "123456789012345678901234567890"
print x$(1), x$(2), x$(3)
close #1