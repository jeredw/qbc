' Test that named block vars are not used for chaining.
common /nope/ a, b, c
common x%, y%, z%
x% = 42: y% = 10: z% = 20
chain "common17.bas"