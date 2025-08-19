' Local variables can shadow unshared globals.
dim x, z(2)
dim s, t(2)
sub foo(s, t(), u, v(2))
  dim x, y, z(2), w(2)
end sub
dim y, w(2)
dim u, v(2)
print "ok"