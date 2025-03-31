type record
 x as integer
 y as string * 5
 z as single
end type
dim data1 as record, data2 as record
open "test.txt" for random as #1 len = len(data1)
data1.x = 42
data1.y = "hello"
data1.z = 3.14
print data1.x, data1.y, data1.z
put #1, 1, data1
get #1, 1, data2
print data2.x, data2.y, data2.z
close #1