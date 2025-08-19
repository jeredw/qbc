' Locals and parameters can shadow shared globals defined later.
sub foo(x, y())
  dim x(2), y
end sub
sub bar(x(), y)
end sub
dim shared x, y(2)