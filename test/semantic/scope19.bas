' Locals and parameters can shadow shared globals.
dim shared x, y(2)
sub foo(x, y())
  dim x(2), y
end sub
sub bar(x(), y)
end sub