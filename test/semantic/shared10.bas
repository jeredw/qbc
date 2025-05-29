sub foo
shared howsit()
howsit(20)=42
end sub
dim howsit(20)
foo
print howsit(20)