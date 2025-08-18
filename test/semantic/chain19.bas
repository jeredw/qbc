' Test string array serialization for chain.
common x$()
dim x$(4)
x$(0) = "hello world"
x$(1) = "this is a test to see if we can"
x$(2) = "chain with variable length string arrays"
x$(4) = "woohoo"
chain "common20.bas"