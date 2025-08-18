' Local variables can shadow unshared globals regardless of AS type.
dim a as integer
dim b%
dim c(5) as string
dim d!(2)
dim e%
sub foo
  dim a$
  dim b!
  dim c%(10)
  dim d#(10)
  dim e%
end sub
print "ok"