type wonky
  x as string * 20
end type
dim buf as wonky
open "test.txt" for random as #1
field #1, 20 as buf.x
close #1