' common shared on already dim'd var should make it shared
dim a(10)
common shared a()
sub foo
 a(1) = 42
end sub
foo
print a(1)